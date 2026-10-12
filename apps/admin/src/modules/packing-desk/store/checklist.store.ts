import type { PackingChecklistKey } from '@pk/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const KEEP_MS = 14 * 86_400_000;

interface Entry {
  done: PackingChecklistKey[];
  updatedAt: number;
}

interface ChecklistState {
  byOrder: Record<string, Entry>;
  toggle: (orderCode: string, key: PackingChecklistKey, checked: boolean) => void;
  clear: (orderCode: string) => void;
}

/**
 * Per-order packing checklist ticks (Phase 7 §7.5) — saved on the phone so a half-packed order
 * survives the app being closed. Entries older than 14 days are dropped on load.
 */
export const useChecklistStore = create<ChecklistState>()(
  persist(
    (set) => ({
      byOrder: {},
      toggle: (orderCode, key, checked) =>
        set((s) => {
          const prev = s.byOrder[orderCode]?.done ?? [];
          const done = checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key);
          return { byOrder: { ...s.byOrder, [orderCode]: { done, updatedAt: Date.now() } } };
        }),
      clear: (orderCode) =>
        set((s) => {
          const { [orderCode]: _removed, ...rest } = s.byOrder;
          return { byOrder: rest };
        }),
    }),
    {
      name: 'pk-desk-checklists',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<ChecklistState> | undefined)?.byOrder ?? {};
        const cutoff = Date.now() - KEEP_MS;
        const byOrder = Object.fromEntries(Object.entries(saved).filter(([, e]) => e.updatedAt > cutoff));
        return { ...current, byOrder };
      },
    },
  ),
);
