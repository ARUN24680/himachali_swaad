'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { env } from '@/lib/env';
import { installFbq, installGtag } from '../lib/vendors';
import { useConsentStore } from '../store/consent.store';

/**
 * Loads GA4 / Meta Pixel ONLY after the matching consent, and never when the env id is empty
 * (Phase 4 §4.8). Before consent this component renders nothing — zero vendor requests.
 */
export function AnalyticsScripts() {
  const hydrated = useConsentStore((s) => s.hydrated);
  const analytics = useConsentStore((s) => s.analytics);
  const marketing = useConsentStore((s) => s.marketing);
  const gaId = env.NEXT_PUBLIC_GA4_ID;
  const pixelId = env.NEXT_PUBLIC_META_PIXEL_ID;
  const loadGa = hydrated && analytics && Boolean(gaId);
  const loadPixel = hydrated && marketing && Boolean(pixelId);

  useEffect(() => {
    if (loadGa && gaId) installGtag(gaId);
  }, [loadGa, gaId]);
  useEffect(() => {
    if (loadPixel && pixelId) installFbq(pixelId);
  }, [loadPixel, pixelId]);

  // Pixel PageView on client-side navigations (GA4 enhanced measurement tracks history changes itself)
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (loadPixel) window.fbq?.('track', 'PageView');
  }, [pathname, loadPixel]);

  return (
    <>
      {loadGa && (
        <Script
          id="ga4"
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId!)}`}
          strategy="afterInteractive"
        />
      )}
      {loadPixel && (
        <Script id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />
      )}
    </>
  );
}
