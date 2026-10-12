import type { Agent } from 'node:https';
import webpush from 'web-push';

/**
 * Web Push for the Partner PWA (D-16, Phase 7 §7.3) with VAPID. No keys configured → `enabled`
 * false and every send reports `disabled`, so callers fall back to WhatsApp.
 */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult =
  | { kind: 'sent'; status: number }
  /** 404 / 410 — the browser dropped this subscription; delete it. */
  | { kind: 'gone'; status: number }
  | { kind: 'failed'; status: number | null; error: string }
  | { kind: 'disabled' };

export interface PushSender {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  send(
    target: PushTarget,
    payload: Record<string, unknown>,
    opts?: { ttlSec?: number; topic?: string },
  ): Promise<PushResult>;
}

export function createWebPushSender(cfg: {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
  timeoutMs?: number;
  /** Tests only: trust a self-signed stand-in push service. */
  agent?: Agent;
}): PushSender {
  if (!cfg.publicKey || !cfg.privateKey || !cfg.subject) {
    return { enabled: false, publicKey: null, send: async () => ({ kind: 'disabled' }) };
  }
  const vapidDetails = { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey };
  return {
    enabled: true,
    publicKey: cfg.publicKey,
    async send(target, payload, opts = {}) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          {
            vapidDetails,
            TTL: opts.ttlSec ?? 6 * 3600,
            urgency: 'high',
            timeout: cfg.timeoutMs ?? 10_000,
            ...(opts.topic ? { topic: opts.topic } : {}),
            ...(cfg.agent ? { agent: cfg.agent } : {}),
          },
        );
        return { kind: 'sent', status: res.statusCode };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? null;
        if (status === 404 || status === 410) return { kind: 'gone', status };
        return { kind: 'failed', status, error: (err as Error).message.slice(0, 300) };
      }
    },
  };
}

/** Topic header must be ≤ 32 URL-safe base64 chars. */
export const pushTopic = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
