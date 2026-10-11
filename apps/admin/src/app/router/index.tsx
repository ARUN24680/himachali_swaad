import { can, rolesFor, type Role } from '@pk/shared';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { FullPageLoading } from '@/components/common/FullPageStatus';
import { NoAccess } from '@/components/common/NoAccess';
import { NotFound } from '@/components/common/NotFound';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { RoleGuard } from '@/components/guards/RoleGuard';
import { useMe } from '@/hooks/useMe';
import { AdminLayout } from '@/layouts/AdminLayout';
import { NotStaffNotice } from '@/modules/auth';
import { BatchesListPage } from '@/modules/inventory';
import { ProductEditorPage, ProductsListPage } from '@/modules/products';

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

/** Start page per role: ADMIN → overview; KITCHEN_PARTNER → batches (their only section for now). */
function IndexRoute() {
  const me = useMe();
  if (!me.data) return null;
  return can(me.data.user.role, 'dashboard:revenue') ? <HomePage /> : <Navigate to="/batches" replace />;
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
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <IndexRoute /> },
              {
                element: <RoleGuard roles={rolesFor('catalog:manage')} fallback={<NoAccess />} />,
                children: [
                  { path: 'products', element: <ProductsListPage /> },
                  { path: 'products/new', element: <ProductEditorPage /> },
                  { path: 'products/:productId', element: <ProductEditorPage /> },
                ],
              },
              {
                element: <RoleGuard roles={rolesFor('batches:manage')} fallback={<NoAccess />} />,
                children: [{ path: 'batches', element: <BatchesListPage /> }],
              },
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);
