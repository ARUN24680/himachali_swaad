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

/** Staff changes move kitchens' partner counts too. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.staff }),
      qc.invalidateQueries({ queryKey: queryKeys.kitchens }),
    ]);
}

export function useCreateStaff() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: StaffCreateRequest) => staffApi.create(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateStaff(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: StaffUpdateRequest) => staffApi.update(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useResetStaffPassword(id: string) {
  return useMutation({ mutationFn: (password: string) => staffApi.resetPassword(id, { password }) });
}
