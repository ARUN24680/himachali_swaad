/**
 * Object storage for public product images (D-11). Browsers upload straight to storage with a
 * short-lived presigned PUT — file bytes never pass through the API.
 * Private documents (labels, invoices) get a private bucket / prefix + signed GETs (private.ts).
 */
export interface PresignedUpload {
  url: string;
  method: 'PUT';
  /** The browser must send exactly these headers (they are part of the signature). */
  headers: Record<string, string>;
  expiresInSec: number;
}

export interface ObjectStorage {
  readonly kind: 'r2' | 's3' | 'local';
  presignPut(input: { key: string; contentType: string; sizeBytes: number }): Promise<PresignedUpload>;
  publicUrl(key: string): string;
  /**
   * Removes a product image. Idempotent: an object that is already gone counts as deleted.
   * Refuses any key outside `products/` (defence in depth — private documents never go through here).
   */
  delete(key: string): Promise<void>;
}

/** Product image keys are `products/<productId>/<file>`; nothing else may be deleted via ObjectStorage. */
export const PRODUCT_IMAGE_PREFIX = 'products/';

export function assertProductImageKey(key: string): void {
  const parts = key.split('/');
  const ok =
    key.startsWith(PRODUCT_IMAGE_PREFIX) &&
    parts.length >= 3 &&
    parts.every((p) => p !== '' && p !== '.' && p !== '..') &&
    !key.includes('\\');
  if (!ok) throw new Error('Refusing to delete a key outside products/');
}

export const UPLOAD_URL_TTL_SEC = 300;

export const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
