import { useCallback } from 'react';
import enDesk from './en/desk.json';
import hiDesk from './hi/desk.json';
import { useLanguageStore, type Language } from './language.store';

/**
 * Tiny typed i18n for the Packing Desk (Phase 7 §7.4, D-16). English is the key source of truth;
 * Hindi (Roman Hinglish, as the partner writes it) must carry exactly the same keys and
 * placeholders — `pnpm --filter @pk/admin check:i18n` enforces it in CI.
 */
type Dict = typeof enDesk;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type DeskKey = Leaves<Dict>;
export type TranslateVars = Record<string, string | number>;
export type Translate = (key: DeskKey, vars?: TranslateVars) => string;

function flatten(obj: object, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else if (v && typeof v === 'object') flatten(v as object, `${prefix}${k}.`, out);
  }
  return out;
}

const DICTS: Record<Language, Map<string, string>> = { en: flatten(enDesk), hi: flatten(hiDesk satisfies Dict) };

export function translate(language: Language, key: DeskKey, vars?: TranslateVars): string {
  const template = DICTS[language].get(key) ?? DICTS.en.get(key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** `const t = useT(); t('queue.count', { count: 3 })` — re-renders when the language changes. */
export function useT(): Translate {
  const language = useLanguageStore((s) => s.language);
  return useCallback((key, vars) => translate(language, key, vars), [language]);
}

/** Outside React (mutation callbacks, toasts): translate with the language chosen right now. */
export const tNow: Translate = (key, vars) => translate(useLanguageStore.getState().language, key, vars);

/** BCP 47 tag for <html lang>: Hindi copy is written in Latin script (Hinglish). */
export const HTML_LANG: Record<Language, string> = { hi: 'hi-Latn', en: 'en' };

export { useLanguageStore, type Language };
