/** Public API of the orders module (Phase 9 §9.3–9.4). ADMIN only. */
import { lazy } from 'react';

export const OrdersListPage = lazy(() => import('./pages/OrdersListPage'));
export { OrdersTable } from './components/OrdersTable';
export { useAdminOrders } from './hooks/useOrders';
