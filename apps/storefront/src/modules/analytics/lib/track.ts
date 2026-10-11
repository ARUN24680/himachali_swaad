import type { BROWSER_CAPI_EVENTS } from '@pk/shared';
import { env } from '@/lib/env';
import { sendServerEvent } from '../api/analyticsApi';
import { useConsentStore } from '../store/consent.store';

/**
 * Commerce events (Phase 4 §4.8). Each event gets ONE `eventId` shared by the Pixel call and the
 * Conversions API relay so Meta de-duplicates them. Nothing is sent without the matching consent:
 * GA4 ← analytics consent; Pixel + CAPI ← marketing consent.
 */
export interface TrackedItem {
  productId: string;
  name: string;
  /** Net weight label, e.g. "250 g". */
  variant?: string;
  unitPricePaise: number;
  quantity: number;
}

type MetaEvent = (typeof BROWSER_CAPI_EVENTS)[number];

/** Analytics payloads take rupees as a number; display-only conversion, never used for money maths. */
const rupees = (paise: number) => paise / 100;

const newEventId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function emit(ga4Event: string, metaEvent: MetaEvent, items: TrackedItem[], valuePaise: number): void {
  if (typeof window === 'undefined') return;
  const { analytics, marketing, decidedAt } = useConsentStore.getState();
  if (decidedAt === null) return;
  const eventId = newEventId();

  if (analytics && env.NEXT_PUBLIC_GA4_ID && window.gtag) {
    window.gtag('event', ga4Event, {
      currency: 'INR',
      value: rupees(valuePaise),
      event_id: eventId,
      items: items.map((i) => ({
        item_id: i.productId,
        item_name: i.name,
        item_variant: i.variant,
        price: rupees(i.unitPricePaise),
        quantity: i.quantity,
      })),
    });
  }

  if (marketing) {
    const contentIds = items.map((i) => i.productId).slice(0, 20);
    if (env.NEXT_PUBLIC_META_PIXEL_ID && window.fbq) {
      window.fbq(
        'track',
        metaEvent,
        { content_ids: contentIds, content_type: 'product', value: rupees(valuePaise), currency: 'INR' },
        { eventID: eventId },
      );
    }
    sendServerEvent({
      eventName: metaEvent,
      eventId,
      eventSourceUrl: window.location.href,
      contentIds,
      valuePaise,
      consent: true,
    });
  }
}

const total = (items: TrackedItem[]) => items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0);

export const trackViewItem = (item: TrackedItem) => emit('view_item', 'ViewContent', [item], total([item]));
export const trackAddToCart = (item: TrackedItem) => emit('add_to_cart', 'AddToCart', [item], total([item]));
export const trackBeginCheckout = (items: TrackedItem[], valuePaise: number) =>
  emit('begin_checkout', 'InitiateCheckout', items, valuePaise);
