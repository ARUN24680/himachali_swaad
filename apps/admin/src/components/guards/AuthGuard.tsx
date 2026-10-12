import { can, type MeResponse } from '@pk/shared';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageError, FullPageLoading } from '@/components/common/FullPageStatus';
import { isNetworkError, isSignedOutError, OfflineSessionContext, useMe } from '@/hooks/useMe';
import { identityToMe, loadIdentity } from '@/lib/offline-cache';

const isDeskPath = (p: string) => p === '/desk' || p.startsWith('/desk/');

/**
 * UX-only gate (the API enforces auth on every route). Signed out → /login?next=<current path>.
 * An expired access cookie is refreshed transparently by services/api/http.ts before we get here.
 *
 * Offline cold start (Phase 7 §7.2): when the session check fails because the NETWORK is down
 * (no response at all — fetch threw, or TanStack paused the query because the phone is offline),
 * NOT because the API said 401/403, and a cached desk identity exists, the Packing Desk renders
 * from that identity in offline mode. Only /desk/* — admin routes stay online-only.
 */
export function AuthGuard() {
  const me = useMe();
  const location = useLocation();

  const networkDown =
    !me.data &&
    (me.fetchStatus === 'paused' ||
      (me.isError && isNetworkError(me.error)) ||
      (me.isPending && isNetworkError(me.failureReason)));
  const signedOut = me.isError && isSignedOutError(me.error);

  // Sticky: every retry of /auth/me resets the query to `pending` (no data yet), which must not
  // flip the desk back to a spinner and remount it. Offline mode ends only with a real answer —
  // a session (me.data) or a 401/403.
  const [offlineMe, setOfflineMe] = useState<MeResponse | null>(null);
  if (me.data || signedOut) {
    if (offlineMe) setOfflineMe(null);
  } else if (networkDown && !offlineMe) {
    const cached = loadIdentity();
    if (cached) setOfflineMe(identityToMe(cached));
  }

  // In offline mode keep asking: the moment the connection is back (or every 30 s on a flaky
  // "connected but no internet" line), re-check the session so the desk goes live again.
  const { refetch } = me;
  const inOfflineMode = offlineMe !== null;
  useEffect(() => {
    if (!inOfflineMode) return;
    const recheck = () => void refetch();
    window.addEventListener('online', recheck);
    const timer = window.setInterval(recheck, 30_000);
    return () => {
      window.removeEventListener('online', recheck);
      window.clearInterval(timer);
    };
  }, [inOfflineMode, refetch]);

  // Same element tree online and offline, so coming back online never remounts the desk
  const outlet = (session: typeof offlineMe) => (
    <OfflineSessionContext.Provider value={session}>
      <Outlet />
    </OfflineSessionContext.Provider>
  );

  if (me.data) return outlet(null);

  if (signedOut) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (offlineMe) {
    if (isDeskPath(location.pathname)) return outlet(offlineMe);
    // Installed app opened at "/" offline: a partner's home is the desk anyway
    if (location.pathname === '/' && !can(offlineMe.user.role, 'dashboard:revenue'))
      return <Navigate to="/desk" replace />;
  }

  // Paused = the phone is offline and nothing is cached: say so instead of spinning forever
  if (me.isPending && me.fetchStatus !== 'paused') return <FullPageLoading label="Checking your session" />;

  return (
    <FullPageError
      title="Can't reach the server"
      message="We couldn't check your session. Check your connection and try again."
      onRetry={() => void me.refetch()}
      retrying={me.isFetching}
    />
  );
}
