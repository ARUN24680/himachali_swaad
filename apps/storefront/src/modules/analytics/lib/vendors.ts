/**
 * Minimal GA4 / Meta Pixel globals. The queue stubs mirror the vendors' official loader snippets so
 * events fired before the script finishes downloading are not lost. Installed ONLY after consent.
 */
type Gtag = (...args: unknown[]) => void;
interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

export function installGtag(measurementId: string): void {
  if (window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // GA4 expects the `arguments` object itself on the dataLayer
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
}

export function installFbq(pixelId: string): void {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  fbq('init', pixelId);
  fbq('track', 'PageView');
}
