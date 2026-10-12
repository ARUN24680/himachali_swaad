import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AwsClient, AwsV4Signer } from 'aws4fetch';
import { withTimeout } from '../../utils/with-timeout';
import { joinUrl } from './storage';

/**
 * PRIVATE documents — invoices now, shipping labels / settlement PDFs later (D-11). Never public:
 * readers get a short-lived signed GET URL. The API/worker uploads server-side (outside DB transactions, D-30).
 */
export interface PrivateStorage {
  readonly kind: 'r2' | 'local';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Server-side read (e.g. merging labels into an A4 sheet). null when the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  signedGetUrl(key: string, ttlSec: number): Promise<{ url: string; expiresAt: Date }>;
}

export const SIGNED_URL_TTL_SEC = 300;

export function createR2PrivateStorage(cfg: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): PrivateStorage {
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const objectUrl = (key: string) => joinUrl(cfg.endpoint, `${cfg.bucket}/${key}`);
  return {
    kind: 'r2',
    async put(key, body, contentType) {
      const res = await withTimeout(
        client.fetch(objectUrl(key), { method: 'PUT', body, headers: { 'content-type': contentType } }),
        20_000,
        'r2 private put',
      );
      if (!res.ok) throw new Error(`R2 PUT failed with ${res.status}`);
    },
    async get(key) {
      const res = await withTimeout(client.fetch(objectUrl(key)), 20_000, 'r2 private get');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`R2 GET failed with ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async signedGetUrl(key, ttlSec) {
      const url = new URL(objectUrl(key));
      url.searchParams.set('X-Amz-Expires', String(ttlSec));
      const signed = await new AwsV4Signer({
        method: 'GET',
        url: url.toString(),
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
        service: 's3',
        region: 'auto',
        signQuery: true,
      }).sign();
      return { url: signed.url.toString(), expiresAt: new Date(Date.now() + ttlSec * 1000) };
    },
  };
}

export const LOCAL_PRIVATE_PATH = '/api/v1/dev-storage/private';

export interface LocalPrivateStorage extends PrivateStorage {
  readonly kind: 'local';
  /** Checks a signed link minted by signedGetUrl; returns the file or null. */
  readSigned(key: string, exp: string, sig: string): Promise<Buffer | null>;
}

/** Dev/test stand-in (STORAGE_DRIVER=local, refused in production): HMAC-signed, expiring links served by the API. */
export function createLocalPrivateStorage(cfg: {
  dir: string;
  apiBaseUrl: string;
  secret: string;
  now?: () => number;
}): LocalPrivateStorage {
  const now = cfg.now ?? Date.now;
  const root = resolve(cfg.dir);
  const sign = (key: string, exp: string) => createHmac('sha256', cfg.secret).update(`${key}\n${exp}`).digest('hex');
  const pathFor = (key: string) => {
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('Key escapes the storage root');
    return full;
  };
  return {
    kind: 'local',
    async put(key, body) {
      const file = pathFor(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async signedGetUrl(key, ttlSec) {
      const expiresAt = new Date(now() + ttlSec * 1000);
      const exp = String(expiresAt.getTime());
      const url = new URL(joinUrl(cfg.apiBaseUrl, `${LOCAL_PRIVATE_PATH}/${key}`));
      url.searchParams.set('exp', exp);
      url.searchParams.set('sig', sign(key, exp));
      return { url: url.toString(), expiresAt };
    },
    async readSigned(key, exp, sig) {
      const expected = Buffer.from(sign(key, exp));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      if (!/^\d+$/.test(exp) || Number(exp) < now()) return null;
      try {
        return await readFile(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
