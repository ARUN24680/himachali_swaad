import { createHash } from 'node:crypto';
import type { Logger } from 'pino';

/** Meta Conversions API event (https://developers.facebook.com/docs/marketing-api/conversions-api). */
export interface CapiEvent {
  eventName: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
  /** Same id the browser Pixel used → Meta de-duplicates the pair. */
  eventId: string;
  eventTime: number;
  eventSourceUrl: string;
  userData: {
    clientIpAddress?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
    /** Already hashed with hashForMeta (Phase 5 Purchase). Never raw phone/email. */
    phoneHashes?: string[];
  };
  customData?: { currency: 'INR'; value?: number; contentIds?: string[]; contentType?: 'product' };
}

export interface ConversionsClient {
  readonly enabled: boolean;
  send(event: CapiEvent): Promise<void>;
}

/** Meta's normalisation: trim, lowercase, SHA-256 hex. Phones as digits with country code (91…). */
export function hashForMeta(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** No pixel id / token → disabled no-op (dev, CI, and until the ad account exists). */
export function createConversionsClient(cfg: {
  pixelId?: string;
  accessToken?: string;
  testEventCode?: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}): ConversionsClient {
  const enabled = Boolean(cfg.pixelId && cfg.accessToken);
  const doFetch = cfg.fetchImpl ?? fetch;
  return {
    enabled,
    async send(e) {
      if (!enabled) return;
      const body = {
        data: [
          {
            event_name: e.eventName,
            event_id: e.eventId,
            event_time: e.eventTime,
            event_source_url: e.eventSourceUrl,
            action_source: 'website',
            user_data: {
              client_ip_address: e.userData.clientIpAddress,
              client_user_agent: e.userData.clientUserAgent,
              fbp: e.userData.fbp,
              fbc: e.userData.fbc,
              ph: e.userData.phoneHashes,
            },
            custom_data: e.customData && {
              currency: e.customData.currency,
              value: e.customData.value,
              content_ids: e.customData.contentIds,
              content_type: e.customData.contentType,
            },
          },
        ],
        ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
      };
      try {
        const res = await doFetch(`https://graph.facebook.com/v21.0/${cfg.pixelId}/events`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.accessToken}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) cfg.logger.warn({ status: res.status, event: e.eventName }, 'meta capi rejected event');
      } catch (err) {
        cfg.logger.warn({ err, event: e.eventName }, 'meta capi send failed');
      }
    },
  };
}
