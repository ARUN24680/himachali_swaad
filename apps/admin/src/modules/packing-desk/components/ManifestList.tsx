import { Skeleton } from '@pk/ui';
import { FileText, WifiOff } from 'lucide-react';
import { useT } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';
import { useOnline } from '../hooks/useOnline';
import { useManifests } from '../hooks/usePartnerOrders';
import { DeskSection } from './DeskSection';
import { LabelButtons } from './LabelButtons';

/** Pickup manifests (Phase 6) to hand the courier — print / share from the desk (Phase 7 §7.6). */
export function ManifestList() {
  const t = useT();
  const manifests = useManifests();
  const online = useOnline();
  return (
    <DeskSection title={t('manifests.title')}>
      {!online && !manifests.data ? (
        <p className="flex items-center gap-2 text-base text-muted-foreground">
          <WifiOff aria-hidden="true" className="size-5 shrink-0" />
          {t('manifests.offline')}
        </p>
      ) : manifests.isPending ? (
        <div role="status" aria-label={t('queue.loading')} className="grid gap-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-12" />
        </div>
      ) : manifests.isError ? (
        <p className="text-base text-muted-foreground">{t('common.errorBody')}</p>
      ) : manifests.data.manifests.length === 0 ? (
        <p className="text-base text-muted-foreground">{t('manifests.empty')}</p>
      ) : (
        <ul className="grid gap-4">
          {manifests.data.manifests.map((m) => (
            <li key={`${m.kitchenCode}-${m.pickupDate}`} className="grid gap-2">
              <p className="flex items-center gap-2 text-base font-semibold">
                <FileText aria-hidden="true" className="size-5 text-muted-foreground" />
                {t('manifests.item', { date: formatCalendarDate(m.pickupDate), count: m.orderCodes.length })}
                <span className="text-sm font-normal text-muted-foreground">{m.kitchenCode}</span>
              </p>
              <LabelButtons
                target={{ kind: 'manifest', pickupDate: m.pickupDate, kitchenCode: m.kitchenCode }}
                printKey="manifests.print"
                shareKey="manifests.share"
              />
            </li>
          ))}
        </ul>
      )}
    </DeskSection>
  );
}
