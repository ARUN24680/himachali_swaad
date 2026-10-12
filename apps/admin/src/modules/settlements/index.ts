/**
 * Public API of the settlements module (Phase 9 §9.9, D-40, D-41). ADMIN pages + the read-only
 * partner hooks / statement components the Packing Desk "Hisaab" tab renders with its own i18n.
 */
import { lazy } from 'react';

export const SettlementsListPage = lazy(() => import('./pages/SettlementsListPage'));
export const SettlementDetailPage = lazy(() => import('./pages/SettlementDetailPage'));

export {
  SettlementBreakdown,
  SettlementStepper,
  type BreakdownLabels,
  type StepperLabels,
} from './components/SettlementBreakdown';
export { partnerSettlementsApi } from './api/settlementsApi';
export { useAcknowledgeSettlement, usePartnerSettlement, usePartnerSettlements } from './hooks/useSettlements';
