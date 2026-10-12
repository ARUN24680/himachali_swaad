import type { ExpenseCreateRequest } from '@pk/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { expensesApi, putToStorage, RECEIPT_TYPES, type ExpensesQuery, type ExpenseUpdate } from '../api/expensesApi';

export function useExpenses(q: ExpensesQuery) {
  return useQuery({
    queryKey: queryKeys.expenses.list(q),
    queryFn: ({ signal }) => expensesApi.list(q, signal),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.expenses.all }),
      qc.invalidateQueries({ queryKey: queryKeys.settlements.all }),
    ]);
}

/** 3-step receipt upload: presign → PUT to storage → PATCH receiptKey. */
export async function uploadReceipt(expenseId: string, file: File) {
  const type = RECEIPT_TYPES.find((t) => t === file.type);
  if (!type) throw new Error('Receipts must be a PDF, JPG, PNG or WebP file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Receipts can be at most 10 MB.');
  const upload = await expensesApi.receiptUpload(expenseId, type, file.size);
  await putToStorage(upload, file);
  await expensesApi.update(expenseId, { receiptKey: upload.key });
}

export function useSaveExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body, receipt }: { id?: string; body: ExpenseCreateRequest; receipt?: File | null }) => {
      const saved = id ? await expensesApi.update(id, body) : await expensesApi.create(body);
      if (receipt) await uploadReceipt(saved.expense.id, receipt);
      return saved.expense;
    },
    onSettled: () => invalidate(),
  });
}

export function useUpdateExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ExpenseUpdate }) => expensesApi.update(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => expensesApi.remove(id), onSuccess: () => invalidate() });
}
