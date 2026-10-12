import { seller } from '@/config/site';

/**
 * wa.me chat link to the seller's WhatsApp (NEXT_PUBLIC_SELLER_WHATSAPP, src/config/site.ts) with a
 * pre-filled message. `null` while the number isn't published yet — callers fall back to /contact.
 */
export function whatsappChatHref(message: string): string | null {
  return seller.whatsapp ? `https://wa.me/${seller.whatsapp}?text=${encodeURIComponent(message)}` : null;
}
