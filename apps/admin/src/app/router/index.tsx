import type { Role } from '@pk/shared';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { FullPageLoading } from '@/components/common/FullPageStatus';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { RoleGuard } from '@/components/guards/RoleGuard';
import { AppShell } from '@/layouts/AppShell';
import { NotStaffNotice } from '@/modules/auth';

const LoginPage = lazy(() => import('@/modules/auth/pages/LoginPage'));
const HomePage = lazy(() => import('@/modules/home/pages/HomePage'));
// Dev-only design-token preview (Phase 1 §1.9) — never shipped in production builds
const TokensPage = import.meta.env.DEV ? lazy(() => import('@/modules/dev-tools/pages/TokensPage')) : null;

const STAFF: readonly Role[] = ['ADMIN', 'KITCHEN_PARTNER'];

function PublicRoute() {
  return (
    <Suspense fallback={<FullPageLoading />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      { path: 'login', element: <LoginPage /> },
      ...(TokensPage ? [{ path: 'dev/tokens', element: <TokensPage /> }] : []),
    ],
  },
  {
    // UX-only guards — the API enforces auth + roles on every request
    element: <AuthGuard />,
    children: [
      {
        element: <RoleGuard roles={STAFF} fallback={<NotStaffNotice />} />,
        children: [{ element: <AppShell />, children: [{ index: true, element: <HomePage /> }] }],
      },
    ],
  },
]);
