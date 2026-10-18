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
}

export const UPLOAD_URL_TTL_SEC = 300;

export const joinUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
