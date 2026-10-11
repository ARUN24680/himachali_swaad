import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageError, FullPageLoading } from '@/components/common/FullPageStatus';
import { isSignedOutError, useMe } from '@/hooks/useMe';

/**
 * UX-only gate (the API enforces auth on every route). Signed out → /login?next=<current path>.
 * An expired access cookie is refreshed transparently by services/api/http.ts before we get here.
 */
export function AuthGuard() {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) return <FullPageLoading label="Checking your session" />;

  if (me.isError) {
    if (isSignedOutError(me.error)) {
      const next = location.pathname + location.search;
      return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <FullPageError
        title="Can't reach the server"
        message="We couldn't check your session. Check your connection and try again."
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  }

  return <Outlet />;
}
