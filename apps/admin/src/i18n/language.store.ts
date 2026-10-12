import { create } from 'zustand';

export type Language = 'hi' | 'en';

const STORAGE_KEY = 'pk-desk-lang';

function readLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'hi' ? v : 'hi';
  } catch {
    return 'hi';
  }
}

interface LanguageState {
  language: Language;
  setLanguage: (l: Language) => void;
}

/** Packing Desk language (D-16): Hindi by default for the partner, English on request; persisted per device. */
export const useLanguageStore = create<LanguageState>((set) => ({
  language: readLanguage(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* storage blocked — still applies for this session */
    }
    set({ language });
  },
}));
