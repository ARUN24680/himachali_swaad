import { create } from 'zustand';
import { outboxDb, type OutboxItem } from '../offline/outbox-db';

interface OutboxState {
  /** Mirror of the IndexedDB outbox (client-only state: taps not yet confirmed by the server). */
  items: OutboxItem[];
  loaded: boolean;
  reload: () => Promise<void>;
  dismiss: (key: string) => Promise<void>;
}

export const useOutboxStore = create<OutboxState>((set, get) => ({
  items: [],
  loaded: false,
  reload: async () => {
    try {
      set({ items: await outboxDb.all(), loaded: true });
    } catch {
      set({ loaded: true }); // private mode without IndexedDB — nothing queued
    }
  },
  dismiss: async (key) => {
    await outboxDb.remove(key).catch(() => undefined);
    await get().reload();
  },
}));

export const selectPendingCodes = (s: OutboxState) =>
  s.items.filter((i) => i.status === 'pending').map((i) => i.orderCode);
