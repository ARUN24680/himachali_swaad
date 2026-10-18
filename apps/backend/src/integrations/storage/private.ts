import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { r2Target } from './r2';
import { createS3PrivateStorage } from './s3';
import { joinUrl, UPLOAD_URL_TTL_SEC } from './storage';

/**
 * PRIVATE documents — invoices, shipping labels, manifests, settlement PDFs, receipts (D-11). Never public:
 * readers get a short-lived signed GET URL. The API/worker uploads server-side (outside DB transactions, D-30).
 */
export interface PrivateStorage {
  readonly kind: 'r2' | 's3' | 'local';
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Server-side read (e.g. merging labels into an A4 sheet). null when the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  signedGetUrl(key: string, ttlSec: number): Promise<{ url: string; expiresAt: Date }>;
  /** Browser upload straight to the bucket (expense receipts) — type + size are signed. */
  presignPut(input: { key: string; contentType: string; sizeBytes: number }): Promise<{
    url: string;
    method: 'PUT';
    headers: Record<string, string>;
    expiresInSec: number;
  }>;
}

export const SIGNED_URL_TTL_SEC = 300;

export function createR2PrivateStorage(cfg: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): PrivateStorage {
  return createS3PrivateStorage('r2', r2Target(cfg));
}

export const LOCAL_PRIVATE_PATH = '/api/v1/dev-storage/private';
export const LOCAL_PRIVATE_UPLOAD_PATH = '/api/v1/dev-storage/private-upload';

export interface LocalPrivateStorage extends PrivateStorage {
  readonly kind: 'local';
  /** Checks a signed link minted by signedGetUrl; returns the file or null. */
  readSigned(key: string, exp: string, sig: string): Promise<Buffer | null>;
  /** Checks an upload token minted by presignPut. */
  verifyUpload(token: string): { key: string; contentType: string; sizeBytes: number } | null;
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
    async presignPut({ key, contentType, sizeBytes }) {
      const payload = Buffer.from(
        JSON.stringify({ key, contentType, sizeBytes, exp: now() + UPLOAD_URL_TTL_SEC * 1000 }),
      ).toString('base64url');
      const url = new URL(joinUrl(cfg.apiBaseUrl, LOCAL_PRIVATE_UPLOAD_PATH));
      url.searchParams.set('token', `${payload}.${sign(payload, 'upload')}`);
      return {
        url: url.toString(),
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresInSec: UPLOAD_URL_TTL_SEC,
      };
    },
    verifyUpload(token) {
      const [payload, sig] = token.split('.');
      if (!payload || !sig) return null;
      const expected = Buffer.from(sign(payload, 'upload'));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        key: string;
        contentType: string;
        sizeBytes: number;
        exp: number;
      };
      if (claims.exp < now()) return null;
      return { key: claims.key, contentType: claims.contentType, sizeBytes: claims.sizeBytes };
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
