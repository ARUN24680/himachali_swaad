import { create } from 'zustand';

/** Chrome's install prompt event (not in the DOM lib yet). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A new service worker is installed and waiting → show "Naya version — Refresh". */
  waitingWorker: ServiceWorker | null;
  installPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  installDismissed: boolean;
  set: (patch: Partial<Omit<PwaState, 'set'>>) => void;
}

/** Client-only PWA lifecycle state (Phase 7 §7.2) — no server data here. */
export const usePwaStore = create<PwaState>((set) => ({
  waitingWorker: null,
  installPrompt: null,
  installed: false,
  installDismissed: false,
  set: (patch) => set(patch),
}));
