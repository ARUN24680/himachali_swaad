import { createS3PublicStorage, type S3Target } from './s3';
import { joinUrl, type ObjectStorage } from './storage';

export interface R2Config {
  /** https://<account-id>.r2.cloudflarestorage.com */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** CDN / custom domain serving the public bucket, e.g. https://img.pahadikhatki.in */
  publicBaseUrl: string;
}

/** R2 speaks the S3 API with path-style URLs and region `auto`. */
export const r2Target = (cfg: Omit<R2Config, 'publicBaseUrl'>): S3Target => ({
  region: 'auto',
  accessKeyId: cfg.accessKeyId,
  secretAccessKey: cfg.secretAccessKey,
  objectUrl: (key) => joinUrl(cfg.endpoint, `${cfg.bucket}/${key}`),
});

/**
 * Cloudflare R2 public bucket (product images). The bucket needs a CORS rule allowing PUT from the
 * admin origin.
 */
export function createR2Storage(cfg: R2Config): ObjectStorage {
  return createS3PublicStorage('r2', r2Target(cfg), cfg.publicBaseUrl);
}
