/** Public API of the customers module (Phase 9 §9.5). ADMIN only (PII). */
import { lazy } from 'react';

export const CustomersListPage = lazy(() => import('./pages/CustomersListPage'));
export const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
