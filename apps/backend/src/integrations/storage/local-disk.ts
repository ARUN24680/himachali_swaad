import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { assertProductImageKey, joinUrl, UPLOAD_URL_TTL_SEC, type ObjectStorage } from './storage';

export interface LocalDiskConfig {
  /** Directory files are written to (gitignored). */
  dir: string;
  /** Public base URL of this API, e.g. http://localhost:4000 */
  apiBaseUrl: string;
  /** HMAC key for upload tokens. */
  secret: string;
  now?: () => number;
}

export const LOCAL_UPLOAD_PATH = '/api/v1/dev-storage/upload';
export const LOCAL_ASSET_PATH = '/dev-assets';

export interface LocalDiskStorage extends ObjectStorage {
  readonly kind: 'local';
  /** Validates an upload token minted by presignPut. Returns the signed constraints or null. */
  verifyUpload(token: string): { key: string; contentType: string; sizeBytes: number } | null;
  write(key: string, body: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
}

/**
 * Development/test stand-in for R2 (never in production — env.ts refuses it). Mimics the R2 flow:
 * presigned PUT → bytes stored → public URL, so the admin upload UI works without cloud credentials.
 */
export function createLocalDiskStorage(cfg: LocalDiskConfig): LocalDiskStorage {
  const now = cfg.now ?? Date.now;
  const root = resolve(cfg.dir);
  const sign = (payload: string) => createHmac('sha256', cfg.secret).update(payload).digest('base64url');

  const pathFor = (key: string) => {
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('Key escapes the storage root');
    return full;
  };

  return {
    kind: 'local',
    async presignPut({ key, contentType, sizeBytes }) {
      const payload = Buffer.from(
        JSON.stringify({ key, contentType, sizeBytes, exp: now() + UPLOAD_URL_TTL_SEC * 1000 }),
      ).toString('base64url');
      const url = new URL(joinUrl(cfg.apiBaseUrl, LOCAL_UPLOAD_PATH));
      url.searchParams.set('token', `${payload}.${sign(payload)}`);
      return {
        url: url.toString(),
        method: 'PUT',
        headers: { 'content-type': contentType },
        expiresInSec: UPLOAD_URL_TTL_SEC,
      };
    },
    publicUrl: (key) => joinUrl(cfg.apiBaseUrl, `${LOCAL_ASSET_PATH}/${key}`),

    verifyUpload(token) {
      const [payload, sig] = token.split('.');
      if (!payload || !sig) return null;
      const expected = Buffer.from(sign(payload));
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
    async write(key, body) {
      const file = pathFor(key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async delete(key) {
      assertProductImageKey(key);
      try {
        await unlink(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
    async read(key) {
      try {
        return await readFile(pathFor(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
