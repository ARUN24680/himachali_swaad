'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';
import { myOrdersApi } from '../api/myOrdersApi';

export const MY_ORDERS_PAGE_SIZE = 10;

export const myOrderKeys = {
  all: ['me', 'orders'] as const,
  list: (page: number) => ['me', 'orders', 'list', page] as const,
  detail: (orderCode: string) => ['me', 'orders', 'detail', orderCode] as const,
};

const retry = (count: number, err: unknown) => !isApiError(err) || (err.code === 'NETWORK_ERROR' && count < 2);

export function useMyOrders(page: number, enabled: boolean) {
  return useQuery({
    queryKey: myOrderKeys.list(page),
    queryFn: ({ signal }) => myOrdersApi.list(page, MY_ORDERS_PAGE_SIZE, signal),
    enabled,
    retry,
    placeholderData: keepPreviousData,
  });
}

export function useMyOrder(orderCode: string, enabled: boolean) {
  return useQuery({
    queryKey: myOrderKeys.detail(orderCode),
    queryFn: ({ signal }) => myOrdersApi.detail(orderCode, signal),
    enabled,
    retry,
  });
}
