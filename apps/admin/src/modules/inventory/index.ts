/** Public API of the inventory module (batches + ledger, Phase 3 §3.7). ADMIN + KITCHEN_PARTNER. */
import { lazy } from 'react';

export const BatchesListPage = lazy(() => import('./pages/BatchesListPage'));
