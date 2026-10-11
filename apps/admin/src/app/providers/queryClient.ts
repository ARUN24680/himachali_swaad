import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/services/api/http';

/** App-wide client (module singleton so the auth-failure handler in main.tsx can clear it). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Never retry auth/permission/validation answers — only transient failures
      retry: (count, err) => (!isApiError(err) || err.status === 0 || err.status >= 500) && count < 1,
    },
  },
});
