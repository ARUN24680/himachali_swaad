import type { Role } from '@pk/shared';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useSession } from '@/hooks/useMe';

interface RoleGuardProps {
  roles: readonly Role[];
  /** Rendered when the signed-in user's role isn't allowed (e.g. an "access denied" notice). */
  fallback: ReactNode;
}

/**
 * UX-only role gate — always nest inside AuthGuard. The API's requireRole() is the real enforcement.
 * In the desk's offline mode the role comes from the cached identity (AuthGuard only allows that on /desk).
 */
export function RoleGuard({ roles, fallback }: RoleGuardProps) {
  const { me } = useSession();
  if (!me) return null; // AuthGuard above handles loading / signed-out / error
  return roles.includes(me.user.role) ? <Outlet /> : fallback;
}
