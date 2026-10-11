import { create } from 'zustand';

interface AccountUiState {
  signInOpen: boolean;
  setSignInOpen: (open: boolean) => void;
}

/** Client UI state only: whether the sign-in sheet is open (any module can open it via `openSignIn`). */
export const useAccountUiStore = create<AccountUiState>((set) => ({
  signInOpen: false,
  setSignInOpen: (signInOpen) => set({ signInOpen }),
}));

export const openSignIn = () => useAccountUiStore.getState().setSignInOpen(true);
