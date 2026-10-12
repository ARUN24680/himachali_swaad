import { useEffect, type ReactNode } from 'react';
import { HTML_LANG, useLanguageStore } from '@/i18n';

/**
 * Packing Desk language scope (D-16): keeps <html lang> in step with the chosen language so screen
 * readers pronounce it right, and restores English when the partner leaves /desk (admin is English).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useLanguageStore((s) => s.language);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = HTML_LANG[language];
    return () => {
      root.lang = 'en';
    };
  }, [language]);
  return children;
}
