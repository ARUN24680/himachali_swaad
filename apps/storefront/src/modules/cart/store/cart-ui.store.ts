import { create } from 'zustand';

/** Client UI state for the drawer (not persisted). `pulse` bumps on every add → header badge animation. */
interface CartUiState {
  open: boolean;
  pulse: number;
  setOpen: (open: boolean) => void;
  bump: () => void;
}

export const useCartUiStore = create<CartUiState>((set) => ({
  open: false,
  pulse: 0,
  setOpen: (open) => set({ open }),
  bump: () => set((s) => ({ pulse: s.pulse + 1 })),
}));

export const openCart = () => useCartUiStore.getState().setOpen(true);
