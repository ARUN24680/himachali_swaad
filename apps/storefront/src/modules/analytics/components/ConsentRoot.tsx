'use client';

import { useEffect } from 'react';
import { CONSENT_STORAGE_KEY, useConsentStore } from '../store/consent.store';
import { AnalyticsScripts } from './AnalyticsScripts';
import { ConsentBanner } from './ConsentBanner';
import { ConsentPreferences } from './ConsentPreferences';

/** Mounted once in the root layout: restores the saved choice after hydration, then banner/dialog/scripts. */
export function ConsentRoot() {
  useEffect(() => {
    void useConsentStore.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CONSENT_STORAGE_KEY) void useConsentStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <>
      <ConsentBanner />
      <ConsentPreferences />
      <AnalyticsScripts />
    </>
  );
}
