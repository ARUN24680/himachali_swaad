/**
 * Public API of the packing-desk module (Phase 7, D-16): Kitchen Partner PWA pages + the
 * chrome PartnerLayout renders. KITCHEN_PARTNER + ADMIN (`packing:operate`).
 */
import { lazy } from 'react';

export const PackingQueuePage = lazy(() => import('./pages/PackingQueuePage'));
export const PackOrderPage = lazy(() => import('./pages/PackOrderPage'));
export const BatchLoggerPage = lazy(() => import('./pages/BatchLoggerPage'));
export const HisaabPage = lazy(() => import('./pages/HisaabPage'));
export const DeskSettingsPage = lazy(() => import('./pages/DeskSettingsPage'));

export { InstallBanner, OfflineBanner, SyncBadge, UpdatePrompt } from './components/DeskChrome';
export { LanguageToggle } from './components/LanguageToggle';
export { useOutboxSync } from './hooks/useOutboxSync';
export { usePartnerOrders } from './hooks/usePartnerOrders';
