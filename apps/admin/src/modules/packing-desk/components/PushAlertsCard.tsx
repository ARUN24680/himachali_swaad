import { Alert, Button, Skeleton } from '@pk/ui';
import { BellOff, BellRing, Loader2 } from 'lucide-react';
import { useT, type DeskKey } from '@/i18n';
import { usePushAlerts, type PushStatus } from '../hooks/usePushAlerts';
import { DeskSection } from './DeskSection';

const INFO: Partial<Record<PushStatus, { key: DeskKey; tone: 'info' | 'warning' }>> = {
  'not-configured': { key: 'settings.alertsWhatsapp', tone: 'info' },
  unsupported: { key: 'settings.alertsUnsupported', tone: 'info' },
  'ios-install': { key: 'settings.alertsIos', tone: 'info' },
  'no-worker': { key: 'settings.alertsNoWorker', tone: 'info' },
  denied: { key: 'settings.alertsDenied', tone: 'warning' },
};

/** "🔔 Naye order ka alert chalu karein" (D-16, Phase 7 §7.3). */
export function PushAlertsCard() {
  const t = useT();
  const { status, config, enable, disable } = usePushAlerts();
  const info = INFO[status];

  return (
    <DeskSection title={t('settings.alertsTitle')}>
      {status === 'loading' ? (
        <div role="status" aria-label={t('settings.alertsLoading')} className="grid gap-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-12" />
        </div>
      ) : status === 'error' ? (
        <div className="grid gap-2">
          <p className="text-base text-muted-foreground">{t('common.errorBody')}</p>
          <Button type="button" variant="outline" className="w-fit" onClick={() => void config.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : info ? (
        <Alert tone={info.tone} className="text-base">
          <BellOff aria-hidden="true" />
          {t(info.key)}
        </Alert>
      ) : status === 'on' ? (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-base font-semibold text-success" role="status">
            <BellRing aria-hidden="true" className="size-5" />
            {t('settings.alertsOn')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full text-base sm:w-fit"
            disabled={disable.isPending}
            onClick={() => disable.mutate()}
          >
            {disable.isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t('settings.alertsDisable')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-base text-muted-foreground">{t('settings.alertsOff')}</p>
          <Button
            type="button"
            size="lg"
            className="w-full text-base"
            disabled={enable.isPending}
            onClick={() => enable.mutate()}
          >
            {enable.isPending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            {t('settings.alertsEnable')}
          </Button>
          {enable.isError && (
            <Alert tone="destructive" className="text-base">
              {t('settings.alertsFailed')}
            </Alert>
          )}
        </div>
      )}
    </DeskSection>
  );
}
