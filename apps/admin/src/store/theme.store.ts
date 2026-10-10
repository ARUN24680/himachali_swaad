import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pk-admin-theme';

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

/** D-14: follow the OS by default, manual override persisted per device. */
export const useThemeStore = create<ThemeState>((set) => ({
  preference: readPreference(),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* storage blocked — preference still applies for this session */
    }
    set({ preference });
  },
}));
