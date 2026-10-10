import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/layouts/AppShell';

const HomePage = lazy(() => import('@/modules/home/pages/HomePage'));
// Dev-only design-token preview (Phase 1 §1.9) — never shipped in production builds
const TokensPage = import.meta.env.DEV ? lazy(() => import('@/modules/dev-tools/pages/TokensPage')) : null;

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      ...(TokensPage ? [{ path: 'dev/tokens', element: <TokensPage /> }] : []),
    ],
  },
]);
