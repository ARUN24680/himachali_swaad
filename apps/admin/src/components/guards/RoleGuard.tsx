import type { Role } from '@pk/shared';
import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { useMe } from '@/hooks/useMe';

interface RoleGuardProps {
  roles: readonly Role[];
  /** Rendered when the signed-in user's role isn't allowed (e.g. an "access denied" notice). */
  fallback: ReactNode;
}

/** UX-only role gate — always nest inside AuthGuard. The API's requireRole() is the real enforcement. */
export function RoleGuard({ roles, fallback }: RoleGuardProps) {
  const me = useMe();
  if (!me.data) return null; // AuthGuard above handles loading / signed-out / error
  return roles.includes(me.data.user.role) ? <Outlet /> : fallback;
}
