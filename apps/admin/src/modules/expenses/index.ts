/** Public API of the expenses module (Phase 9 §9.8). ADMIN only. */
import { lazy } from 'react';

export const ExpensesListPage = lazy(() => import('./pages/ExpensesListPage'));
export { CATEGORY_LABEL } from './components/expenseMeta';
