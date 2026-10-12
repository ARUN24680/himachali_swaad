import { can, rolesFor, type Role } from '@pk/shared';
import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { FullPageLoading } from '@/components/common/FullPageStatus';
import { NoAccess } from '@/components/common/NoAccess';
import { NotFound } from '@/components/common/NotFound';
import { AuthGuard } from '@/components/guards/AuthGuard';
import { RoleGuard } from '@/components/guards/RoleGuard';
import { useMe } from '@/hooks/useMe';
import { AdminLayout } from '@/layouts/AdminLayout';
import { PartnerLayout } from '@/layouts/PartnerLayout';
import { NotStaffNotice } from '@/modules/auth';
import { AuditLogPage } from '@/modules/audit-log';
import { CustomerDetailPage, CustomersListPage } from '@/modules/customers';
import { DashboardPage } from '@/modules/dashboard';
import { ExpensesListPage } from '@/modules/expenses';
import { ExportsPage } from '@/modules/exports';
import { BatchesListPage, StockLedgerPage } from '@/modules/inventory';
import { OrdersListPage } from '@/modules/orders';
import {
  BatchLoggerPage,
  DeskSettingsPage,
  HisaabDetailPage,
  HisaabPage,
  PackingQueuePage,
  PackOrderPage,
} from '@/modules/packing-desk';
import { ProductEditorPage, ProductsListPage } from '@/modules/products';
import { OpsPage } from '@/modules/queues';
import { SettingsPage } from '@/modules/settings';
import { SettlementDetailPage, SettlementsListPage } from '@/modules/settlements';
import { StaffListPage } from '@/modules/staff';

const LoginPage = lazy(() => import('@/modules/auth/pages/LoginPage'));
const AccountPage = lazy(() => import('@/modules/home/pages/AccountPage'));
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

/** Start page per role: ADMIN → dashboard (Phase 9 §9.2); KITCHEN_PARTNER → the Packing Desk PWA (Phase 7). */
function IndexRoute() {
  const me = useMe();
  if (!me.data) return null;
  return can(me.data.user.role, 'dashboard:revenue') ? <DashboardPage /> : <Navigate to="/desk" replace />;
}

/** ADMIN-only branch of the route table, gated by one capability (UX only — the API enforces). */
const gated = (capability: Parameters<typeof rolesFor>[0], children: { path: string; element: ReactNode }[]) => ({
  element: <RoleGuard roles={rolesFor(capability)} fallback={<NoAccess />} />,
  children,
});

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
            // Packing Desk PWA (Phase 7, D-16): KITCHEN_PARTNER + ADMIN, own mobile shell
            path: 'desk',
            element: <RoleGuard roles={rolesFor('packing:operate')} fallback={<NoAccess />} />,
            children: [
              {
                element: <PartnerLayout />,
                children: [
                  { index: true, element: <PackingQueuePage /> },
                  { path: 'pack/:orderCode', element: <PackOrderPage /> },
                  { path: 'batches', element: <BatchLoggerPage /> },
                  { path: 'hisaab', element: <HisaabPage /> },
                  { path: 'hisaab/:settlementId', element: <HisaabDetailPage /> },
                  { path: 'settings', element: <DeskSettingsPage /> },
                  { path: '*', element: <NotFound /> },
                ],
              },
            ],
          },
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
                children: [
                  { path: 'batches', element: <BatchesListPage /> },
                  { path: 'batches/:batchId/ledger', element: <StockLedgerPage /> },
                ],
              },
              { path: 'account', element: <AccountPage /> },
              // ── Phase 9 admin console ──
              gated('orders:all', [
                { path: 'orders', element: <OrdersListPage /> },
                { path: 'orders/:orderCode', element: <OrdersListPage /> },
                { path: 'ops-issues', element: <Navigate to="/orders?tab=attention" replace /> },
                { path: 'exports', element: <ExportsPage /> },
              ]),
              gated('customers:read', [
                { path: 'customers', element: <CustomersListPage /> },
                { path: 'customers/:phone', element: <CustomerDetailPage /> },
              ]),
              gated('settlements:manage', [
                { path: 'settlements', element: <SettlementsListPage /> },
                { path: 'settlements/:settlementId', element: <SettlementDetailPage /> },
                { path: 'expenses', element: <ExpensesListPage /> },
              ]),
              gated('settings:manage', [
                { path: 'settings', element: <SettingsPage /> },
                { path: 'staff', element: <StaffListPage /> },
                { path: 'audit-log', element: <AuditLogPage /> },
              ]),
              gated('queues:view', [{ path: 'ops', element: <OpsPage /> }]),
              { path: '*', element: <NotFound /> },
            ],
          },
        ],
      },
    ],
  },
]);
