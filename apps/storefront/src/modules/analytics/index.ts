/** Public API of the analytics module (consent + GA4/Meta events). */
export { ConsentRoot } from './components/ConsentRoot';
export { ConsentPreferencesButton } from './components/ConsentPreferencesButton';
export { trackAddToCart, trackBeginCheckout, trackViewItem, type TrackedItem } from './lib/track';
export { openConsentPreferences } from './store/consent.store';
