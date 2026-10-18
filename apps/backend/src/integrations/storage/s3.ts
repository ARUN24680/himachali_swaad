import { AwsClient, AwsV4Signer } from 'aws4fetch';
import { withTimeout } from '../../utils/with-timeout';
import type { PrivateStorage } from './private';
import { joinUrl, UPLOAD_URL_TTL_SEC, type ObjectStorage } from './storage';

/**
 * Any S3-API bucket (AWS S3, Cloudflare R2): object URL + SigV4 credentials. Uploads are presigned
 * PUTs with Content-Type and Content-Length signed, so the browser must send exactly the declared
 * type and size; private reads are presigned GETs (D-11).
 */
export interface S3Target {
  /** `https://<bucket>.s3.<region>.amazonaws.com/<key>` (AWS) or `<endpoint>/<bucket>/<key>` (R2). */
  objectUrl(key: string): string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface AwsS3Config {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** Bucket names are lowercase in S3; DNS ignores case, so normalise rather than fail on a pasted name. */
export function awsS3Target(cfg: AwsS3Config): S3Target {
  const base = `https://${cfg.bucket.toLowerCase()}.s3.${cfg.region}.amazonaws.com`;
  return { ...cfg, objectUrl: (key) => joinUrl(base, encodeKey(key)) };
}

/** Public URL base of an AWS bucket when no CDN (CloudFront / custom domain) is configured. */
export const awsS3PublicBaseUrl = (cfg: Pick<AwsS3Config, 'bucket' | 'region'>) =>
  `https://${cfg.bucket.toLowerCase()}.s3.${cfg.region}.amazonaws.com`;

/** Keys are ours (uuid + extension), but keep `/` and encode anything else for the signature. */
const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

async function presign(
  t: S3Target,
  method: 'PUT' | 'GET',
  key: string,
  ttlSec: number,
  headers?: Record<string, string>,
): Promise<string> {
  const url = new URL(t.objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(ttlSec));
  const signed = await new AwsV4Signer({
    method,
    url: url.toString(),
    ...(headers ? { headers, allHeaders: true } : {}),
    accessKeyId: t.accessKeyId,
    secretAccessKey: t.secretAccessKey,
    service: 's3',
    region: t.region,
    signQuery: true,
  }).sign();
  return signed.url.toString();
}

async function presignUpload(t: S3Target, key: string, contentType: string, sizeBytes: number) {
  const url = await presign(t, 'PUT', key, UPLOAD_URL_TTL_SEC, {
    'content-type': contentType,
    'content-length': String(sizeBytes),
  });
  // Browsers set Content-Length themselves (and refuse to set it manually)
  return {
    url,
    method: 'PUT' as const,
    headers: { 'content-type': contentType },
    expiresInSec: UPLOAD_URL_TTL_SEC,
  };
}

/** Product images: browser uploads with a presigned PUT; the storefront reads `publicBaseUrl/<key>`. */
export function createS3PublicStorage(kind: 'r2' | 's3', t: S3Target, publicBaseUrl: string): ObjectStorage {
  return {
    kind,
    presignPut: ({ key, contentType, sizeBytes }) => presignUpload(t, key, contentType, sizeBytes),
    publicUrl: (key) => joinUrl(publicBaseUrl, key),
  };
}

/**
 * Invoices, labels, manifests, statements, receipts: never public. `keyPrefix` lets one bucket hold
 * both kinds (AWS: `private/…`, kept out of the public-read bucket policy).
 */
export function createS3PrivateStorage(kind: 'r2' | 's3', t: S3Target, keyPrefix = ''): PrivateStorage {
  const client = new AwsClient({
    accessKeyId: t.accessKeyId,
    secretAccessKey: t.secretAccessKey,
    service: 's3',
    region: t.region,
  });
  const full = (key: string) => `${keyPrefix}${key}`;
  return {
    kind,
    async put(key, body, contentType) {
      const res = await withTimeout(
        client.fetch(t.objectUrl(full(key)), { method: 'PUT', body, headers: { 'content-type': contentType } }),
        20_000,
        `${kind} private put`,
      );
      if (!res.ok) throw new Error(`${kind.toUpperCase()} PUT failed with ${res.status}`);
    },
    async get(key) {
      const res = await withTimeout(client.fetch(t.objectUrl(full(key))), 20_000, `${kind} private get`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${kind.toUpperCase()} GET failed with ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async signedGetUrl(key, ttlSec) {
      const url = await presign(t, 'GET', full(key), ttlSec);
      return { url, expiresAt: new Date(Date.now() + ttlSec * 1000) };
    },
    presignPut: ({ key, contentType, sizeBytes }) => presignUpload(t, full(key), contentType, sizeBytes),
  };
}
