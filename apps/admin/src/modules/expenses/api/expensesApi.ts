import type {
  ExpenseCreateRequest,
  ExpenseRow,
  ExpensesQuerySchema,
  ExpensesResponseSchema,
  ExpenseUpdateRequestSchema,
  ReceiptUploadResponseSchema,
  SignedUrlResponse,
} from '@pk/shared';
import type { z } from 'zod';
import { http } from '@/services/api/http';

export type ExpensesQuery = z.input<typeof ExpensesQuerySchema>;
export type ExpensesResponse = z.infer<typeof ExpensesResponseSchema>;
export type ExpenseUpdate = z.input<typeof ExpenseUpdateRequestSchema>;
export type ReceiptUpload = z.infer<typeof ReceiptUploadResponseSchema>;
export const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
/** ReceiptUploadRequestSchema.sizeBytes max in @pk/shared (D-56 j): 5 MB. */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;

const qs = (q: ExpensesQuery) => {
  const p = new URLSearchParams();
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.category) p.set('category', q.category);
  if (q.page && q.page !== 1) p.set('page', String(q.page));
  if (q.pageSize) p.set('pageSize', String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Shared business expenses (Phase 9 §9.8). Rows in a FINALIZED / PAID settlement are locked server-side. */
export const expensesApi = {
  list: (q: ExpensesQuery, signal?: AbortSignal) => http<ExpensesResponse>(`/admin/expenses${qs(q)}`, { signal }),
  create: (body: ExpenseCreateRequest) => http<{ expense: ExpenseRow }>('/admin/expenses', { method: 'POST', body }),
  update: (id: string, body: ExpenseUpdate) =>
    http<{ expense: ExpenseRow }>(`/admin/expenses/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => http<unknown>(`/admin/expenses/${id}`, { method: 'DELETE' }),
  receiptUpload: (id: string, contentType: (typeof RECEIPT_TYPES)[number], sizeBytes: number) =>
    http<ReceiptUpload>(`/admin/expenses/${id}/receipt-upload`, { method: 'POST', body: { contentType, sizeBytes } }),
  receipt: (id: string) => http<SignedUrlResponse>(`/admin/expenses/${id}/receipt`),
};

/** Presigned PUT straight to private storage (R2) — no cookies, the URL is the credential. */
export async function putToStorage(upload: ReceiptUpload, file: File): Promise<void> {
  let res: Response;
  try {
    res = await fetch(upload.uploadUrl, { method: upload.method, headers: upload.headers, body: file });
  } catch {
    throw new Error('Upload failed — check your connection and try again.');
  }
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`);
}
