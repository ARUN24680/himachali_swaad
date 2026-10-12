/** Public API of the settings module (Phase 9 §9.7). ADMIN only. */
import { lazy } from 'react';

export const SettingsPage = lazy(() => import('./pages/SettingsPage'));
