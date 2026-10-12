import { create } from 'zustand';

export const A4_MAX = 20;

interface DeskUiState {
  /** Order codes whose card is sliding out after Mark Packed (optimistic, Phase 7 §7.7). */
  leaving: string[];
  startLeaving: (code: string) => void;
  stopLeaving: (code: string) => void;
  /** A4 4-up selection mode on the queue (Phase 7 §7.6). */
  a4Mode: boolean;
  a4Selected: string[];
  setA4Mode: (on: boolean) => void;
  toggleA4: (code: string) => void;
}

/** Client-only desk UI state — order data itself stays in TanStack Query. */
export const useDeskUiStore = create<DeskUiState>((set) => ({
  leaving: [],
  startLeaving: (code) => set((s) => ({ leaving: s.leaving.includes(code) ? s.leaving : [...s.leaving, code] })),
  stopLeaving: (code) => set((s) => ({ leaving: s.leaving.filter((c) => c !== code) })),
  a4Mode: false,
  a4Selected: [],
  setA4Mode: (on) => set({ a4Mode: on, a4Selected: [] }),
  toggleA4: (code) =>
    set((s) =>
      s.a4Selected.includes(code)
        ? { a4Selected: s.a4Selected.filter((c) => c !== code) }
        : s.a4Selected.length >= A4_MAX
          ? s
          : { a4Selected: [...s.a4Selected, code] },
    ),
}));
