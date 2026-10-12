import type { MarkPackedResponse, PackingChecklist, PartnerOrderCard, PartnerOrdersResponse } from '@pk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tNow as t } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';
import { queryKeys } from '@/services/api/query-keys';
import { toast } from '@/store/toast.store';
import { packingDeskApi } from '../api/packingDeskApi';
import { failedItem, requestBackgroundSync } from '../offline/flush';
import { outboxDb } from '../offline/outbox-db';
import { isRetryable } from '../offline/retryable';
import { useChecklistStore } from '../store/checklist.store';
import { useDeskUiStore } from '../store/desk-ui.store';
import { useOutboxStore } from '../store/outbox.store';

export const MARK_PACKED_KEY = ['packing-desk', 'mark-packed'] as const;

export interface MarkPackedVars {
  /** The card being packed — also lets the queue render its slide-out after the cache drops it. */
  order: PartnerOrderCard;
  /** Idempotency-Key, generated once per tap and reused for every replay (D-54 b). */
  key: string;
  checklist: PackingChecklist;
}

export type MarkPackedOutcome = { kind: 'packed'; response: MarkPackedResponse } | { kind: 'queued' };

type Snapshot = PartnerOrdersResponse | undefined;

/**
 * Mark Packed (Phase 7 §7.7): optimistic — the card leaves the to-pack list at once (no undo; the
 * state change is irreversible for the partner). No internet / server hiccup → the call goes to
 * the IndexedDB outbox and replays later with the same Idempotency-Key. A terminal answer
 * (cancelled, not ready) puts the card back and is shown on the queue until dismissed.
 */
export function useMarkPacked() {
  const qc = useQueryClient();
  const listKey = queryKeys.partner.orders.list('AWAITING_PACKING');

  return useMutation<MarkPackedOutcome, unknown, MarkPackedVars, { snapshot: Snapshot }>({
    mutationKey: MARK_PACKED_KEY,
    // Must run while offline too — that's when it queues (TanStack would otherwise pause it)
    networkMode: 'always',
    mutationFn: async ({ order, key, checklist }) => {
      const enqueue = async (): Promise<MarkPackedOutcome> => {
        await outboxDb.put({ key, orderCode: order.orderCode, checklist, createdAt: Date.now(), status: 'pending' });
        void requestBackgroundSync();
        return { kind: 'queued' };
      };
      if (!navigator.onLine) return enqueue();
      try {
        return { kind: 'packed', response: await packingDeskApi.markPacked(order.orderCode, key, checklist) };
      } catch (err) {
        if (isRetryable(err)) return enqueue();
        throw err;
      }
    },
    onMutate: async ({ order }) => {
      useDeskUiStore.getState().startLeaving(order.orderCode);
      await qc.cancelQueries({ queryKey: listKey });
      const snapshot = qc.getQueryData<PartnerOrdersResponse>(listKey);
      qc.setQueryData<PartnerOrdersResponse>(listKey, (prev) =>
        prev
          ? {
              ...prev,
              orders: prev.orders.filter((o) => o.orderCode !== order.orderCode),
              toPack: Math.max(0, prev.toPack - 1),
            }
          : prev,
      );
      return { snapshot };
    },
    onSuccess: async (outcome, { order }) => {
      useChecklistStore.getState().clear(order.orderCode);
      await useOutboxStore.getState().reload();
      if (outcome.kind === 'queued') {
        toast({ title: t('sync.queued', { code: order.orderCode }), tone: 'neutral' });
        return;
      }
      const pickup = outcome.response.pickupDate;
      toast({
        title: t('pack.packed', { code: order.orderCode }),
        description: pickup ? t('pack.pickupOn', { date: formatCalendarDate(pickup) }) : undefined,
      });
    },
    onError: async (err, { order, key, checklist }, context) => {
      if (context?.snapshot) qc.setQueryData(listKey, context.snapshot);
      useDeskUiStore.getState().stopLeaving(order.orderCode);
      // Keep the answer on the phone so the partner sees it on the queue (and after a reload)
      await outboxDb
        .put(failedItem({ key, orderCode: order.orderCode, checklist, createdAt: Date.now() }, err))
        .catch(() => undefined);
      await useOutboxStore.getState().reload();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.partner.orders.all }),
  });
}
