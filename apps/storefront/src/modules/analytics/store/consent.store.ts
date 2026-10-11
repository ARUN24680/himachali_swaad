import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * DPDP-aligned cookie consent (Phase 4 §4.8, Rules §4.4). Both optional categories default OFF;
 * nothing optional loads until the visitor actively opts in. Strictly necessary storage (cart,
 * consent choice, theme, last pincode) needs no consent.
 */
export const CONSENT_STORAGE_KEY = 'pk-consent-v1';

export interface ConsentChoice {
  analytics: boolean;
  marketing: boolean;
}

interface ConsentState extends ConsentChoice {
  /** null until the visitor has chosen — the banner shows only then. */
  decidedAt: string | null;
  hydrated: boolean;
  preferencesOpen: boolean;
  decide: (choice: ConsentChoice) => void;
  setPreferencesOpen: (open: boolean) => void;
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      analytics: false,
      marketing: false,
      decidedAt: null,
      hydrated: false,
      preferencesOpen: false,
      decide: (choice) => set({ ...choice, decidedAt: new Date().toISOString(), preferencesOpen: false }),
      setPreferencesOpen: (preferencesOpen) => set({ preferencesOpen }),
    }),
    {
      name: CONSENT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: ({ analytics, marketing, decidedAt }) => ({ analytics, marketing, decidedAt }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ConsentChoice & { decidedAt: string | null }>;
        return {
          ...current,
          analytics: p.analytics === true,
          marketing: p.marketing === true,
          decidedAt: typeof p.decidedAt === 'string' ? p.decidedAt : null,
        };
      },
      onRehydrateStorage: () => () => useConsentStore.setState({ hydrated: true }),
    },
  ),
);

export const openConsentPreferences = () => useConsentStore.getState().setPreferencesOpen(true);
