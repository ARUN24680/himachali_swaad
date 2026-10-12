import { SW_MESSAGES, SW_URL } from './constants';
import { usePwaStore, type BeforeInstallPromptEvent } from './pwa.store';
import { isStandalone } from './platform';

/**
 * Service worker + install lifecycle (Phase 7 §7.2). Registered in production builds (and in dev
 * only with VITE_PWA_DEV=true, so Vite HMR is never cached). A new version waits until the user
 * taps "Refresh" — we never swap code under a partner mid-packing.
 */
export function registerPwa(): void {
  const store = usePwaStore.getState();
  store.set({ installed: isStandalone() });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the mini-infobar
    usePwaStore.getState().set({ installPrompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwaStore.getState().set({ installPrompt: null, installed: true }));

  const enabled = import.meta.env.PROD || import.meta.env.VITE_PWA_DEV === 'true';
  if (!enabled || !('serviceWorker' in navigator)) return;

  // Reload only when the partner asked for the new version — the first install's clients.claim()
  // also fires controllerchange, and must not yank the page away mid-task.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: '/' })
      .then((reg) => {
        const offer = (worker: ServiceWorker | null) => {
          // Only an UPDATE needs a prompt — the very first install simply takes control
          if (worker && navigator.serviceWorker.controller) usePwaStore.getState().set({ waitingWorker: worker });
        };
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed') offer(installing);
          });
        });
        // Phones keep the app open for days — look for a new version whenever it comes to the front
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      })
      .catch((err: unknown) => console.warn('Service worker registration failed', err));
  });
}

let updateRequested = false;
let reloading = false;

/** "Naya version — Refresh": activate the waiting worker; controllerchange reloads the page. */
export function applyUpdate(): void {
  updateRequested = true;
  const worker = usePwaStore.getState().waitingWorker;
  if (worker) worker.postMessage({ type: SW_MESSAGES.skipWaiting });
  else window.location.reload();
}

export async function promptInstall(): Promise<void> {
  const prompt = usePwaStore.getState().installPrompt;
  if (!prompt) return;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  usePwaStore.getState().set({ installPrompt: null, installed: outcome === 'accepted' });
}
