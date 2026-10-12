import { Languages } from 'lucide-react';
import { useLanguageStore, useT } from '@/i18n';

/** One-tap Hindi ↔ English switch in the desk header (D-16). Shows the language you'd switch TO. */
export function LanguageToggle() {
  const t = useT();
  const { language, setLanguage } = useLanguageStore();
  const next = language === 'hi' ? 'en' : 'hi';
  const nextName = next === 'hi' ? t('lang.hindi') : t('lang.english');
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={t('lang.toggle', { lang: nextName })}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-secondary-foreground/30 px-3 text-sm font-semibold text-secondary-foreground transition-colors outline-none hover:bg-secondary-foreground/10 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Languages aria-hidden="true" className="size-4" />
      <span lang={next === 'hi' ? 'hi-Latn' : 'en'} aria-hidden="true" className="sm:hidden">
        {next === 'hi' ? t('lang.hindiShort') : t('lang.englishShort')}
      </span>
      <span lang={next === 'hi' ? 'hi-Latn' : 'en'} className="hidden sm:inline">
        {nextName}
      </span>
    </button>
  );
}
