import { randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import { decryptSecret, encryptSecret, hmacHex, safeEqual } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { orderStore } from '../gateway/gateway.service';
import * as repo from './alerts.repository';
import type { AlertsService } from './alerts.service';

/** ± clock skew accepted on X-Timestamp; nonces are remembered at least this long. */
export const SKEW_MS = 5 * 60_000;

export const ObserverAlertSchema = z.object({
  /** SMS sender id (e.g. AD-HDFCBK) or the bank app package for a notification. */
  sender: z.string().trim().min(2).max(100),
  text: z.string().min(10).max(2_000),
  /** When the phone received it (epoch ms). */
  receivedAt: z.number().int().positive(),
});

export interface SignedRequest {
  deviceId: string | undefined;
  timestamp: string | undefined;
  nonce: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
}

/** What the phone signs: HMAC_SHA256(deviceSecret, `${timestamp}.${nonce}.${rawBody}`). */
export const observerSignature = (secret: string, timestamp: string, nonce: string, rawBody: Buffer | string) =>
  hmacHex(secret, Buffer.concat([Buffer.from(`${timestamp}.${nonce}.`), Buffer.from(rawBody)]));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Channel 2: our Android observer app. Every request is signed with the device's own secret,
 * timestamped and carries a single-use nonce — a copied request cannot be replayed, a stolen phone
 * is revoked with one CLI command. Only allowlisted bank senders are accepted.
 */
export function createObserverChannel(deps: {
  db: Db;
  alerts: AlertsService;
  kek: Buffer;
  bankSenders: string[];
  logger: Logger;
  now?: () => number;
}) {
  const now = deps.now ?? (() => Date.now());
  const unauthorized = () => new AppError('INVALID_SIGNATURE', 'Request signature is not valid');

  async function authenticate(req: SignedRequest): Promise<repo.DeviceRow> {
    const { deviceId, timestamp, nonce, signature } = req;
    if (!deviceId || !UUID.test(deviceId) || !timestamp || !nonce || !signature) throw unauthorized();
    if (!/^\d{13}$/.test(timestamp) || Math.abs(now() - Number(timestamp)) > SKEW_MS) throw unauthorized();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) throw unauthorized();
    const device = await repo.findActiveDevice(deps.db, deviceId);
    if (!device) throw unauthorized();
    const secret = decryptSecret(deps.kek, device.secret_ciphertext);
    if (!safeEqual(observerSignature(secret, timestamp, nonce, req.rawBody), signature)) throw unauthorized();
    // Only after the signature is valid, so nobody can burn a device's nonces
    if (!(await repo.useNonce(deps.db, device.id, nonce))) throw unauthorized();
    return device;
  }

  // TRAI DLT headers look like AD-HDFCBK / VM-HDFCBK-S; an allowlist entry can also be a bank
  // app's package name (notification listener). Exact header match only — no substring tricks.
  const senderAllowed = (sender: string) => {
    const s = sender.toLowerCase();
    return deps.bankSenders.some(
      (b) => s === b || new RegExp(`^[a-z]{2}-${b.replace(/[^a-z0-9]/g, '')}(-[a-z])?$`).test(s),
    );
  };

  return {
    async handleAlert(req: SignedRequest) {
      const device = await authenticate(req);
      let body: z.infer<typeof ObserverAlertSchema>;
      try {
        body = ObserverAlertSchema.parse(JSON.parse(req.rawBody.toString('utf8')));
      } catch {
        throw new AppError('BAD_REQUEST_ERROR', 'Malformed alert');
      }
      await repo.touchDevice(deps.db, device.id);
      return deps.alerts.ingest({
        source: 'ANDROID',
        externalId: `android:${device.id}:${req.nonce}`,
        sender: body.sender,
        creditedAt: new Date(body.receivedAt),
        text: body.text,
        ...(senderAllowed(body.sender) ? {} : { rejectReason: 'SENDER_NOT_ALLOWED' }),
      });
    },

    /** Signed heartbeat (empty body) — the watchdog alerts when a phone goes silent. */
    async heartbeat(req: SignedRequest) {
      const device = await authenticate(req);
      await repo.touchDevice(deps.db, device.id);
    },

    /** CLI: returns the secret ONCE — it is stored only encrypted. */
    async enroll(label: string, by: string) {
      const secret = randomBytes(32).toString('base64url');
      const device = await repo.insertDevice(deps.db, label, encryptSecret(deps.kek, secret));
      await orderStore.audit(deps.db, {
        actor: by,
        action: 'DEVICE_ENROLLED',
        entityId: device.id,
        details: { label },
      });
      return { deviceId: device.id, secret };
    },

    async revoke(id: string, by: string) {
      if (!UUID.test(id)) return false;
      const done = await repo.revokeDevice(deps.db, id);
      if (done) await orderStore.audit(deps.db, { actor: by, action: 'DEVICE_REVOKED', entityId: id, details: {} });
      return done;
    },
    list: () => repo.listDevices(deps.db),
  };
}

export type ObserverChannel = ReturnType<typeof createObserverChannel>;
