import type { PartnerManifestsResponse } from '@pk/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useT, type DeskKey } from '@/i18n';
import { isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';
import { packingDeskApi } from '../api/packingDeskApi';

export type LabelTarget =
  | { kind: 'order'; code: string }
  | { kind: 'a4'; codes: string[] }
  | { kind: 'manifest'; pickupDate: string; kitchenCode: string };

export interface LabelNotice {
  tone: 'info' | 'warning' | 'destructive' | 'success';
  key: DeskKey;
  /** Signed URL to open by hand when the browser blocked our tab / share isn't possible. */
  url?: string;
}

const targetId = (t: LabelTarget) =>
  t.kind === 'order' ? t.code : t.kind === 'a4' ? `a4:${t.codes.join(',')}` : `m:${t.kitchenCode}:${t.pickupDate}`;

/**
 * Label print / share (D-37, Phase 7 §7.6). Print opens the 5-minute signed PDF in a new tab (the
 * phone's PDF viewer has Print). Share hands the PDF FILE to the share sheet (WhatsApp, printer
 * apps); without file sharing we download it. No Web Bluetooth.
 */
export function useLabelActions() {
  const t = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<{ id: string; action: 'print' | 'share' } | null>(null);
  const [notice, setNotice] = useState<(LabelNotice & { id: string }) | null>(null);

  const signedUrl = async (target: LabelTarget): Promise<string> => {
    if (target.kind === 'order') return (await packingDeskApi.label(target.code)).url;
    if (target.kind === 'a4') return (await packingDeskApi.a4Labels(target.codes)).url;
    // Manifest URLs come with the list; fetch a fresh one when it's about to expire
    const find = (r: PartnerManifestsResponse | undefined) =>
      r?.manifests.find((m) => m.pickupDate === target.pickupDate && m.kitchenCode === target.kitchenCode);
    let hit = find(qc.getQueryData<PartnerManifestsResponse>(queryKeys.partner.manifests));
    if (!hit || Date.parse(hit.expiresAt) - Date.now() < 30_000) {
      hit = find(
        await qc.fetchQuery({
          queryKey: queryKeys.partner.manifests,
          queryFn: () => packingDeskApi.manifests(),
          staleTime: 0,
        }),
      );
    }
    if (!hit) throw new Error('Manifest not found');
    return hit.url;
  };

  const failure = (err: unknown): LabelNotice =>
    isApiError(err, 'NETWORK_ERROR')
      ? { tone: 'warning', key: 'label.offline' }
      : isApiError(err) && err.status === 404
        ? { tone: 'warning', key: 'label.notReady' }
        : { tone: 'destructive', key: 'label.failed' };

  const fileName = (target: LabelTarget) =>
    target.kind === 'order'
      ? `${target.code}-label.pdf`
      : target.kind === 'a4'
        ? `labels-a4-${target.codes.length}.pdf`
        : `manifest-${target.kitchenCode}-${target.pickupDate}.pdf`;

  const shareTitle = (target: LabelTarget) =>
    target.kind === 'manifest'
      ? t('manifests.shareTitle', { date: target.pickupDate })
      : t('label.shareTitle', { code: target.kind === 'order' ? target.code : target.codes.join(', ') });

  async function print(target: LabelTarget) {
    const id = targetId(target);
    setNotice(null);
    if (!navigator.onLine) {
      setNotice({ id, tone: 'warning', key: 'label.offline' });
      return;
    }
    // Open the tab inside the tap (popup blockers), point it at the PDF once we have the URL
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setBusy({ id, action: 'print' });
    try {
      const url = await signedUrl(target);
      if (tab && !tab.closed) tab.location.href = url;
      else setNotice({ id, tone: 'info', key: 'label.popupBlocked', url });
    } catch (err) {
      tab?.close();
      setNotice({ id, ...failure(err) });
    } finally {
      setBusy(null);
    }
  }

  async function share(target: LabelTarget) {
    const id = targetId(target);
    setNotice(null);
    if (!navigator.onLine) {
      setNotice({ id, tone: 'warning', key: 'label.offline' });
      return;
    }
    setBusy({ id, action: 'share' });
    let url: string | undefined;
    try {
      url = await signedUrl(target);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`PDF ${res.status}`);
      const file = new File([await res.blob()], fileName(target), { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle(target) });
        return;
      }
      // No file sharing (desktop browsers) → save the PDF instead
      const href = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = href;
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setNotice({ id, tone: 'success', key: 'label.downloaded' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // closed the share sheet
      // Got a URL but couldn't fetch / share the file (e.g. storage CORS) → let them open it
      if (url) setNotice({ id, tone: 'info', key: 'label.popupBlocked', url });
      else setNotice({ id, ...failure(err) });
    } finally {
      setBusy(null);
    }
  }

  return {
    print,
    share,
    isBusy: (target: LabelTarget, action?: 'print' | 'share') =>
      busy?.id === targetId(target) && (!action || busy.action === action),
    noticeFor: (target: LabelTarget) => (notice?.id === targetId(target) ? notice : null),
    clearNotice: () => setNotice(null),
  };
}
