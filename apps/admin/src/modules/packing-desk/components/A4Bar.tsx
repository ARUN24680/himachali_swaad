import { useT } from '@/i18n';
import { useDeskUiStore } from '../store/desk-ui.store';
import { LabelButtons } from './LabelButtons';

/** Sticky action bar for the A4 4-up sheet (cyber-café printing, Phase 7 §7.6). */
export function A4Bar() {
  const t = useT();
  const selected = useDeskUiStore((s) => s.a4Selected);
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card p-3 shadow-float md:bottom-0 md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto grid max-w-5xl gap-2">
        <p className="text-base font-semibold" aria-live="polite">
          {t('a4.selected', { count: selected.length })}
          <span className="ml-2 font-normal text-muted-foreground">{t('a4.max')}</span>
        </p>
        {selected.length > 0 && (
          <LabelButtons target={{ kind: 'a4', codes: selected }} printKey="a4.print" shareKey="a4.share" />
        )}
      </div>
    </div>
  );
}
