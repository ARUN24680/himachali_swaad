import type { AdminCancelOrderRequest, AdminOrdersQuery, AdminRefundRequest, RESENDABLE_TEMPLATES } from '@pk/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { ordersApi } from '../api/ordersApi';

export function useAdminOrders(q: AdminOrdersQuery) {
  return useQuery({
    queryKey: queryKeys.orders.list(q),
    queryFn: ({ signal }) => ordersApi.list(q, signal),
    placeholderData: keepPreviousData, // tab / page change: keep rows, dim them, no skeleton flash
  });
}

export function useAdminOrder(code: string | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(code ?? 'none'),
    queryFn: ({ signal }) => ordersApi.detail(code as string, signal),
    enabled: Boolean(code),
  });
}

/** Any order action → this order, every list/tab count and the dashboard KPIs are stale. */
function useInvalidateOrder(code: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.orders.all }),
      qc.invalidateQueries({ queryKey: queryKeys.orders.detail(code) }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
      qc.invalidateQueries({ queryKey: queryKeys.customers.all }),
    ]);
}

export function useOrderActions(code: string) {
  const invalidate = useInvalidateOrder(code);
  const opts = { onSuccess: () => invalidate() };
  return {
    cancel: useMutation({ mutationFn: (b: AdminCancelOrderRequest) => ordersApi.cancel(code, b), ...opts }),
    refund: useMutation({
      mutationFn: ({ body, key }: { body: AdminRefundRequest; key: string }) => ordersApi.refund(code, body, key),
      ...opts,
    }),
    resend: useMutation({
      mutationFn: (t: (typeof RESENDABLE_TEMPLATES)[number]) => ordersApi.resend(code, t),
      ...opts,
    }),
    retryShipment: useMutation({ mutationFn: () => ordersApi.retryShipment(code), ...opts }),
    resolveIssue: useMutation({ mutationFn: (note: string) => ordersApi.resolveIssue(code, note), ...opts }),
    addNote: useMutation({ mutationFn: (text: string) => ordersApi.addNote(code, text), ...opts }),
  };
}
