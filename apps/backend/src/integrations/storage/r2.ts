import { AwsV4Signer } from 'aws4fetch';
import { joinUrl, UPLOAD_URL_TTL_SEC, type ObjectStorage } from './storage';

export interface R2Config {
  /** https://<account-id>.r2.cloudflarestorage.com */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** CDN / custom domain serving the public bucket, e.g. https://img.pahadikhatki.in */
  publicBaseUrl: string;
}

/**
 * Cloudflare R2 (S3 API) presigned PUT. Content-Type and Content-Length are signed, so the upload
 * fails unless the browser sends the declared type and exact size (R2 has no POST-policy size cap).
 * The bucket needs a CORS rule allowing PUT from the admin origin.
 */
export function createR2Storage(cfg: R2Config): ObjectStorage {
  return {
    kind: 'r2',
    async presignPut({ key, contentType, sizeBytes }) {
      const url = new URL(joinUrl(cfg.endpoint, `${cfg.bucket}/${key}`));
      url.searchParams.set('X-Amz-Expires', String(UPLOAD_URL_TTL_SEC));
      const headers = { 'content-type': contentType, 'content-length': String(sizeBytes) };
      const signed = await new AwsV4Signer({
        method: 'PUT',
        url: url.toString(),
        headers,
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        service: 's3',
        region: 'auto',
        signQuery: true,
        allHeaders: true,
      }).sign();
      // Browsers set Content-Length themselves (and refuse to set it manually)
      return {
        url: signed.url.toString(),
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresInSec: UPLOAD_URL_TTL_SEC,
      };
    },
    publicUrl: (key) => joinUrl(cfg.publicBaseUrl, key),
  };
}
