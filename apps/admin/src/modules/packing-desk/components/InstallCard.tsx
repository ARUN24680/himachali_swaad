import { Button } from '@pk/ui';
import { CheckCircle2, Download } from 'lucide-react';
import { useT, type DeskKey } from '@/i18n';
import { isIos } from '@/pwa/platform';
import { usePwaStore } from '@/pwa/pwa.store';
import { promptInstall } from '@/pwa/register';
import { DeskSection } from './DeskSection';

const IOS_STEPS: DeskKey[] = ['settings.iosStep1', 'settings.iosStep2', 'settings.iosStep3', 'settings.iosStep4'];
const ANDROID_STEPS: DeskKey[] = ['settings.androidStep1', 'settings.androidStep2'];

/** Install the PWA (Phase 7 §7.2) — Chrome's prompt when available, plus iOS / Android step guides. */
export function InstallCard() {
  const t = useT();
  const installPrompt = usePwaStore((s) => s.installPrompt);
  const installed = usePwaStore((s) => s.installed);
  const ios = isIos();

  const guide = (title: DeskKey, steps: DeskKey[]) => (
    <div className="grid content-start gap-2 rounded-md bg-muted/70 p-4">
      <h3 className="text-base font-semibold">{t(title)}</h3>
      <ol className="grid list-decimal gap-1.5 pl-5 text-base">
        {steps.map((s) => (
          <li key={s}>{t(s)}</li>
        ))}
      </ol>
    </div>
  );

  return (
    <DeskSection title={t('settings.installTitle')}>
      {installed ? (
        <p className="flex items-center gap-2 text-base font-semibold text-success" role="status">
          <CheckCircle2 aria-hidden="true" className="size-5" />
          {t('settings.installInstalled')}
        </p>
      ) : (
        <>
          {installPrompt && (
            <div className="grid gap-3">
              <p className="text-base">{t('settings.installReady')}</p>
              <Button
                type="button"
                size="lg"
                className="w-full text-base sm:w-fit"
                onClick={() => void promptInstall()}
              >
                <Download aria-hidden="true" />
                {t('settings.installAction')}
              </Button>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {ios
              ? [guide('settings.iosTitle', IOS_STEPS), guide('settings.androidTitle', ANDROID_STEPS)]
              : [guide('settings.androidTitle', ANDROID_STEPS), guide('settings.iosTitle', IOS_STEPS)]}
          </div>
        </>
      )}
    </DeskSection>
  );
}
