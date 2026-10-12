import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { auditLogApi, type AuditLogQuery } from '../api/auditLogApi';

export function useAuditLog(q: AuditLogQuery) {
  return useQuery({
    queryKey: queryKeys.auditLog(q),
    queryFn: ({ signal }) => auditLogApi.list(q, signal),
    placeholderData: keepPreviousData,
  });
}
