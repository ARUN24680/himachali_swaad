import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { customersApi, type CustomersQuery } from '../api/customersApi';

export function useCustomers(q: CustomersQuery) {
  return useQuery({
    queryKey: queryKeys.customers.list(q),
    queryFn: ({ signal }) => customersApi.list(q, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(phone: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(phone ?? 'none'),
    queryFn: ({ signal }) => customersApi.detail(phone as string, signal),
    enabled: Boolean(phone),
  });
}
