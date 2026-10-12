import { Button } from '@pk/ui';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '@/hooks/useMe';
import { useT } from '@/i18n';
import { formatDateTime } from '@/lib/dates';
import { usePwaStore } from '@/pwa/pwa.store';
import { applyUpdate, promptInstall } from '@/pwa/register';
import { useFlushNow } from '../hooks/useOutboxSync';
import { useOnline } from '../hooks/useOnline';
import { selectOldestCachedAt, useDeskOfflineStore } from '../store/offline.store';
import { selectPendingCodes, useOutboxStore } from '../store/outbox.store';

/** "⏳ Sync pending (N)" in the header — tap to retry now (Phase 7 §7.2). */
export function SyncBadge() {
  const t = useT();
  const pending = useOutboxStore(useShallow(selectPendingCodes));
  const flush = useFlushNow();
  if (pending.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => void flush()}
      aria-describedby="sync-pending-help"
      className="inline-flex min-h-11 items-center rounded-full bg-primary px-3 text-sm font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
    >
      <span className="hidden sm:inline">{t('sync.pending', { count: pending.length })}</span>
      <span aria-hidden="true" className="tabular-nums sm:hidden">
        {t('sync.pendingShort', { count: pending.length })}
      </span>
      <span className="sr-only sm:hidden">{t('sync.pending', { count: pending.length })}</span>
      <span id="sync-pending-help" className="sr-only">
        {t('sync.pendingHelp')} {t('sync.syncNow')}
      </span>
    </button>
  );
}

/**
 * Offline strip under the header. Shown when the phone is offline, when the desk runs from the
 * cached identity (offline cold start), or when a list on screen is the SAVED copy — then it also
 * says how old that list is.
 */
export function OfflineBanner() {
  const t = useT();
  const online = useOnline();
  const { offline: offlineSession } = useSession();
  const cachedAt = useDeskOfflineStore(selectOldestCachedAt);
  if (online && !offlineSession && cachedAt === null) return null;
  return (
    <div role="status" data-testid="offline-banner" className="border-b border-warning/30 bg-warning/15 text-warning">
      <div className="mx-auto flex max-w-5xl items-start gap-2 px-4 py-2.5 md:px-6">
        <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p className="grid min-w-0 gap-0.5 text-base">
          {cachedAt !== null && (
            <span className="font-semibold">
              {t('common.offlineCached', { time: formatDateTime(new Date(cachedAt).toISOString()) })}
            </span>
          )}
          <span className="font-medium">{t('common.offlineBanner')}</span>
        </p>
      </div>
    </div>
  );
}

/** "Naya version — Refresh" when a new service worker is waiting (Phase 7 §7.2). */
export function UpdatePrompt() {
  const t = useT();
  const waiting = usePwaStore((s) => s.waitingWorker);
  if (!waiting) return null;
  return (
    <div role="status" className="border-b border-info/30 bg-info/15 text-info">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6">
        <p className="text-base font-semibold">{t('pwa.updateTitle')}</p>
        <Button type="button" variant="secondary" onClick={applyUpdate}>
          <RefreshCw aria-hidden="true" />
          {t('pwa.updateAction')}
        </Button>
      </div>
    </div>
  );
}

/** Install nudge when Chrome offers it (Android) — dismissible for the session. */
export function InstallBanner() {
  const t = useT();
  const { installPrompt, installDismissed, set } = usePwaStore();
  if (!installPrompt || installDismissed) return null;
  return (
    <div className="border-b border-border bg-accent">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5 md:px-6">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="text-base font-semibold">{t('pwa.installTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('pwa.installBody')}</p>
        </div>
        <Button type="button" onClick={() => void promptInstall()}>
          <Download aria-hidden="true" />
          {t('pwa.installAction')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('pwa.installLater')}
          onClick={() => set({ installDismissed: true })}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
