/** Public API of the inventory module (batches + ledger, Phase 3 §3.7). ADMIN + KITCHEN_PARTNER. */
import { lazy } from 'react';

export const BatchesListPage = lazy(() => import('./pages/BatchesListPage'));
export const StockLedgerPage = lazy(() => import('./pages/StockLedgerPage'));

// Data hooks reused by the Packing Desk mobile batch logger (Phase 7 §7.8, D-42)
export { useBatches, useBatchProductOptions, useCreateBatch, usePickupLocations } from './hooks/useBatches';
