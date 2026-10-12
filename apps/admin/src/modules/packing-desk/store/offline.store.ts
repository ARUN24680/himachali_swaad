import { create } from 'zustand';
import { onOfflineDataCleared } from '@/lib/offline-cache';
import type { OrderTab } from '../hooks/usePartnerOrders';

interface DeskOfflineState {
  /**
   * When a tab is showing the SAVED list because the API was unreachable: that list's save time
   * (ms). Only metadata for the banner — the orders themselves live in the TanStack Query cache.
   */
  cachedAt: Partial<Record<OrderTab, number>>;
  servedFromCache: (status: OrderTab, savedAt: number) => void;
  fresh: (status: OrderTab) => void;
  reset: () => void;
}

export const useDeskOfflineStore = create<DeskOfflineState>((set) => ({
  cachedAt: {},
  servedFromCache: (status, savedAt) => set((s) => ({ cachedAt: { ...s.cachedAt, [status]: savedAt } })),
  fresh: (status) =>
    set((s) => {
      if (!(status in s.cachedAt)) return s;
      const next = { ...s.cachedAt };
      delete next[status];
      return { cachedAt: next };
    }),
  reset: () => set({ cachedAt: {} }),
}));

onOfflineDataCleared(() => useDeskOfflineStore.getState().reset());

/** Oldest save time among the tabs currently showing a saved list (null = everything is live). */
export const selectOldestCachedAt = (s: DeskOfflineState): number | null => {
  const times = Object.values(s.cachedAt);
  return times.length ? Math.min(...times) : null;
};
