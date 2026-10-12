/** Public API of the staff module (Phase 9 §9.7). ADMIN only. */
import { lazy } from 'react';

export const StaffListPage = lazy(() => import('./pages/StaffListPage'));
export { useStaff } from './hooks/useStaff';
