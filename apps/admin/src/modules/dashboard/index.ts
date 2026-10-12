/** Public API of the dashboard module (Phase 9 §9.2). ADMIN only. */
import { lazy } from 'react';

export const DashboardPage = lazy(() => import('./pages/DashboardPage'));
export { useDashboard } from './hooks/useDashboard';
