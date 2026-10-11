import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES, type AdminProduct } from '@pk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';
import { productsApi, putFileToStorage } from '../api/productsApi';
import { useUpdateProduct } from './useProducts';

export interface UploadItem {
  id: string;
  name: string;
  previewUrl: string;
  progress: number;
  status: 'uploading' | 'saving' | 'error';
  error?: string;
}

const ALLOWED = new Set<string>(IMAGE_CONTENT_TYPES);
const MB = 1024 * 1024;

/** Client-side guard mirroring the server allowlist (D-11). */
export function validateImage(file: File): string | null {
  if (!ALLOWED.has(file.type)) return `${file.name}: use a JPG, PNG or WebP photo`;
  if (file.size > MAX_IMAGE_BYTES)
    return `${file.name}: ${(file.size / MB).toFixed(1)} MB is over the ${MAX_IMAGE_BYTES / MB} MB limit`;
  return null;
}

/**
 * Upload → PUT to storage → PATCH images. Files go one at a time so each PATCH builds on the
 * latest saved list (no lost photos when several are dropped at once). Reorder/remove PATCH too.
 */
export function useProductImages(product: AdminProduct) {
  const qc = useQueryClient();
  const update = useUpdateProduct(product.id);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const patchItem = (id: string, patch: Partial<UploadItem>) =>
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const currentKeys = useCallback(
    () => (qc.getQueryData<AdminProduct>(queryKeys.products.detail(product.id)) ?? product).images.map((i) => i.key),
    [qc, product],
  );

  const addFiles = async (files: File[]) => {
    const room = MAX_PRODUCT_IMAGES - currentKeys().length - uploads.filter((u) => u.status !== 'error').length;
    const accepted = files.slice(0, Math.max(0, room));
    const items: (UploadItem & { file: File })[] = accepted.map((file) => {
      const problem = validateImage(file);
      return {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: problem ? 'error' : 'uploading',
        error: problem ?? undefined,
      };
    });
    const skipped = files.length - accepted.length;
    setUploads((list) => [...list, ...items.map(({ file: _f, ...u }) => u)]);

    for (const item of items) {
      if (item.status === 'error') continue;
      try {
        const ticket = await productsApi.requestImageUpload({
          productId: product.id,
          contentType: item.file.type as (typeof IMAGE_CONTENT_TYPES)[number],
          sizeBytes: item.file.size,
        });
        await putFileToStorage(ticket, item.file, (progress) => patchItem(item.id, { progress }));
        patchItem(item.id, { status: 'saving', progress: 100 });
        await update.mutateAsync({ images: [...currentKeys(), ticket.key] });
        URL.revokeObjectURL(item.previewUrl);
        setUploads((list) => list.filter((u) => u.id !== item.id));
      } catch (err) {
        patchItem(item.id, {
          status: 'error',
          error: isApiError(err) || err instanceof Error ? err.message : 'Upload failed',
        });
      }
    }
    return skipped;
  };

  const dismiss = (id: string) =>
    setUploads((list) => {
      const item = list.find((u) => u.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return list.filter((u) => u.id !== id);
    });

  /** Save a new order / removal. [0] is the primary photo. */
  const saveOrder = (keys: string[]) => update.mutateAsync({ images: keys });

  return { uploads, addFiles, dismiss, saveOrder, saving: update.isPending, saveError: update.error };
}
