/** Public API of the exports module (Phase 9 §9.10): streamed, audited CSV downloads. ADMIN only. */
import { lazy } from 'react';

export const ExportsPage = lazy(() => import('./pages/ExportsPage'));
