/** Public API of the waitlist module (audit 2026-11-03, R-5): pre-launch sign-ups. ADMIN only (PII). */
import { lazy } from 'react';

export const WaitlistPage = lazy(() => import('./pages/WaitlistPage'));
