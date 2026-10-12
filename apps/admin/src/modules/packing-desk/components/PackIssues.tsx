import { Alert, Button } from '@pk/ui';
import { AlertTriangle } from 'lucide-react';
import { useT, type DeskKey } from '@/i18n';
import type { OutboxItem } from '../offline/outbox-db';
import { useOutboxStore } from '../store/outbox.store';

const messageKey = (item: OutboxItem): DeskKey => {
  if (item.error?.reason === 'ORDER_CANCELLED') return 'issue.cancelled';
  if (item.error?.reason === 'NOT_READY') return 'issue.notReady';
  if (item.error?.httpStatus === 404) return 'issue.notFound';
  return 'issue.other';
};

/**
 * Mark Packed calls the server refused (cancelled meanwhile, not ready, not this kitchen) — online
 * or replayed from the offline queue. Stays until the partner taps OK.
 */
export function PackIssues() {
  const t = useT();
  const { items, dismiss } = useOutboxStore();
  const failed = items.filter((i) => i.status === 'failed');
  if (failed.length === 0) return null;
  return (
    <div className="grid gap-2">
      {failed.map((item) => (
        <Alert key={item.key} tone="destructive" className="items-center text-base">
          <AlertTriangle aria-hidden="true" />
          <span className="min-w-0 flex-1 font-semibold">{t(messageKey(item), { code: item.orderCode })}</span>
          <Button type="button" variant="outline" className="shrink-0" onClick={() => void dismiss(item.key)}>
            {t('common.ok')}
          </Button>
        </Alert>
      ))}
    </div>
  );
}
