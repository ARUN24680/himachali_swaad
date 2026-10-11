import type {
  AdminProduct,
  ImageUploadRequest,
  ImageUploadResponse,
  ProductCreateRequest,
  ProductUpdateRequest,
} from '@pk/shared';
import { http } from '@/services/api/http';

type ProductEnvelope = { product: AdminProduct };

/** Typed calls for /admin/products and product image uploads (Phase 3 §3.2–3.3). No React here. */
export const productsApi = {
  list: (signal?: AbortSignal) => http<{ products: AdminProduct[] }>('/admin/products', { signal }),
  get: (id: string, signal?: AbortSignal) => http<ProductEnvelope>(`/admin/products/${id}`, { signal }),
  create: (body: ProductCreateRequest) => http<ProductEnvelope>('/admin/products', { method: 'POST', body }),
  update: (id: string, body: ProductUpdateRequest) =>
    http<ProductEnvelope>(`/admin/products/${id}`, { method: 'PATCH', body }),
  publish: (id: string) => http<ProductEnvelope>(`/admin/products/${id}/publish`, { method: 'POST', body: {} }),
  unpublish: (id: string) => http<ProductEnvelope>(`/admin/products/${id}/unpublish`, { method: 'POST', body: {} }),
  requestImageUpload: (body: ImageUploadRequest) =>
    http<ImageUploadResponse>('/admin/uploads/product-image', { method: 'POST', body }),
};

/**
 * PUT the file straight to storage (R2 presigned URL). XHR instead of fetch for upload progress.
 * No credentials — the URL itself is the authorisation, and cookies must never go to the bucket.
 */
export function putFileToStorage(
  upload: Pick<ImageUploadResponse, 'uploadUrl' | 'headers'>,
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', upload.uploadUrl);
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
