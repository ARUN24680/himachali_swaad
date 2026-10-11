/** Public API of the products module (ADMIN catalog, Phase 3 §3.7). */
import { lazy } from 'react';

export const ProductsListPage = lazy(() => import('./pages/ProductsListPage'));
export const ProductEditorPage = lazy(() => import('./pages/ProductEditorPage'));
