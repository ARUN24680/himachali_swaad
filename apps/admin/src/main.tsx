import '@fontsource-variable/inter';
import '@fontsource/playfair-display/500.css';
import '@fontsource/playfair-display/600.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryProvider } from './app/providers/QueryProvider';
import { queryClient } from './app/providers/queryClient';
import { ThemeProvider } from './app/providers/ThemeProvider';
import { router } from './app/router';
import { clearOfflineData } from './lib/offline-cache';
import { initSentry } from './lib/sentry';
import { registerPwa } from './pwa/register';
import { setAuthFailureHandler } from './services/api/http';

initSentry();
registerPwa(); // Packing Desk PWA: service worker, install + update prompts (Phase 7)

// Session could not be refreshed → drop every cached response and send the user to sign in,
// remembering where they were (Phase 2 §2.7). The desk's offline identity + cached queues go too.
setAuthFailureHandler(() => {
  queryClient.clear();
  void clearOfflineData();
  const { pathname, search } = window.location;
  if (pathname === '/login') return;
  void router.navigate(`/login?next=${encodeURIComponent(pathname + search)}`, { replace: true });
});

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing from index.html');

createRoot(root).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>,
);
