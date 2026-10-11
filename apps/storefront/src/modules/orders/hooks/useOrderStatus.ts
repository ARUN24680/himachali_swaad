'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/lib/api-client';
import { useCountdown } from '@/lib/use-countdown';
import { ordersApi } from '../api/ordersApi';

export const orderKeys = {
  status: (orderCode: string, phone: string | undefined) => ['orders', 'status', orderCode, phone ?? null] as const,
  all: (orderCode: string) => ['orders', 'status', orderCode] as const,
};

const POLL_MS = 3_000;
const POLL_WINDOW_MS = 60_000;

/**
 * Order status with "Confirming your payment…" polling (Phase 5 §5.11): every 3 s for up to 60 s
 * while PENDING_PAYMENT (the webhook can be late). `refresh()` starts a fresh 60 s window.
 */
export function useOrderStatus(orderCode: string, phone: string | undefined, enabled: boolean) {
  const [windowStart, setWindowStart] = useState(() => Date.now());
  const windowLeft = useCountdown(windowStart + POLL_WINDOW_MS);

  const query = useQuery({
    queryKey: orderKeys.status(orderCode, phone),
    queryFn: ({ signal }) => ordersApi.status(orderCode, phone, signal),
    enabled,
    retry: (count, err) => !isApiError(err) || (err.code === 'NETWORK_ERROR' && count < 2),
    refetchInterval: (q) =>
      q.state.data?.status === 'PENDING_PAYMENT' && Date.now() - windowStart < POLL_WINDOW_MS ? POLL_MS : false,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    /** Still PENDING_PAYMENT after the 60 s polling window. */
    pollTimedOut: query.data?.status === 'PENDING_PAYMENT' && windowLeft === 0,
    refresh: () => {
      setWindowStart(Date.now());
      void query.refetch();
    },
    /** 404 / 401 / 403: unknown code or the phone doesn't match — ask for the phone. */
    needsPhone:
      isApiError(query.error, 'NOT_FOUND') ||
      isApiError(query.error, 'UNAUTHENTICATED') ||
      isApiError(query.error, 'FORBIDDEN'),
  };
}

export function useInvoiceDownload(orderCode: string, phone: string | undefined) {
  return useMutation({
    mutationFn: () => ordersApi.invoice(orderCode, phone),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useCancelOrder(orderCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => ordersApi.cancel(orderCode, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all(orderCode) }),
  });
}
