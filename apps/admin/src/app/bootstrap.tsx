/**
 * The real admin + Packing Desk app. `main.tsx` loads this module only when the build is not
 * pre-launch locked (`lib/launch-mode.ts`), so a locked production bundle doesn't contain it.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryProvider } from '@/app/providers/QueryProvider';
import { queryClient } from '@/app/providers/queryClient';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { router } from '@/app/router';
import { clearOfflineData } from '@/lib/offline-cache';
import { initSentry } from '@/lib/sentry';
import { registerPwa } from '@/pwa/register';
import { totpSetupUrl } from '@/modules/auth';
import { setAuthFailureHandler, setTotpRequiredHandler } from '@/services/api/http';

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

// ADMIN without 2FA in production: every admin call answers 403 TOTP_ENROLLMENT_REQUIRED (Phase 10
// §10.1). Send them to /account to enrol, remembering where they were; already there → stay put.
setTotpRequiredHandler(() => {
  const target = totpSetupUrl(window.location.pathname, window.location.search);
  if (target) void router.navigate(target, { replace: true });
});

export function mountApp(root: HTMLElement): void {
  createRoot(root).render(
    <StrictMode>
      <QueryProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryProvider>
    </StrictMode>,
  );
}
