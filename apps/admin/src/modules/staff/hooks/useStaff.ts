import type { StaffCreateRequest, StaffUpdateRequest } from '@pk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { staffApi } from '../api/staffApi';

export function useStaff() {
  return useQuery({
    queryKey: queryKeys.staff,
    queryFn: ({ signal }) => staffApi.list(signal).then((r) => r.staff),
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffCreateRequest) => staffApi.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff }),
  });
}

export function useUpdateStaff(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffUpdateRequest) => staffApi.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.staff }),
  });
}
