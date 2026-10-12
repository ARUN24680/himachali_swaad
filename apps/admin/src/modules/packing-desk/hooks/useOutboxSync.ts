import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { tNow } from '@/i18n';
import { SW_MESSAGES } from '@/pwa/constants';
import { queryKeys } from '@/services/api/query-keys';
import { toast } from '@/store/toast.store';
import { flushOutbox } from '../offline/flush';
import { useOutboxStore } from '../store/outbox.store';

/**
 * Keeps the offline outbox moving (Phase 7 §7.2): flush on app open, when the phone comes back
 * online, when the tab returns to the front, and refresh after the SW's Background Sync replayed it.
 */
export function useOutboxSync(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const { reload } = useOutboxStore.getState();
    const announce = (synced: string[]) => {
      for (const code of synced) toast({ title: tNow('sync.synced', { code }) });
    };

    let alive = true;
    const sync = async () => {
      await reload();
      if (!navigator.onLine || useOutboxStore.getState().items.every((i) => i.status !== 'pending')) return;
      const result = await flushOutbox().catch(() => null);
      if (!alive) return;
      await reload();
      if (result && (result.synced.length || result.failed.length)) {
        announce(result.synced);
        void qc.invalidateQueries({ queryKey: queryKeys.partner.orders.all });
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onSwMessage = (e: MessageEvent<{ type?: string; synced?: string[] }>) => {
      if (e.data?.type !== SW_MESSAGES.outboxChanged) return;
      void reload();
      announce(e.data.synced ?? []);
      void qc.invalidateQueries({ queryKey: queryKeys.partner.orders.all });
    };

    // Back online: replay the outbox AND drop any saved (offline) lists for live ones
    const onOnline = () => {
      void sync();
      void qc.invalidateQueries({ queryKey: queryKeys.partner.orders.all });
    };

    void sync();
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => {
      alive = false;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [qc]);
}

/** "Sync now" button. */
export function useFlushNow() {
  const qc = useQueryClient();
  return async () => {
    const result = await flushOutbox().catch(() => null);
    await useOutboxStore.getState().reload();
    if (result?.synced.length || result?.failed.length)
      await qc.invalidateQueries({ queryKey: queryKeys.partner.orders.all });
  };
}
