/** Public API of the kitchens module (pickup locations — was SQL-only, workflow/01 §3). ADMIN only. */
import { lazy } from 'react';

export const KitchensPage = lazy(() => import('./pages/KitchensPage'));
export { useKitchens } from './hooks/useKitchens';
