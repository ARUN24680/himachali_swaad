import {
  nextCutoff,
  pickupDateFor,
  type MarkPackedResponse,
  type OrderStatus,
  type PackingChecklist,
  type PartnerManifestsResponse,
  type PartnerOrdersResponse,
  type SignedUrlResponse,
} from '@pk/shared';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import { renderA4LabelSheet } from '../../integrations/pdf/label-sheet';
import { SIGNED_URL_TTL_SEC, type PrivateStorage } from '../../integrations/storage/private';
import { jobIds, type JobQueue } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { orderStore, transitionOrder } from '../orders/orders.service';
import type { SettingsService } from '../settings/settings.service';
import * as repo from './partner.repository';

const CutoffHour = z.coerce.number().int().min(0).max(23);
/** Once packed, Mark Packed again is a no-op success (offline queue replays, double taps). */
const PACKED_OR_LATER: readonly OrderStatus[] = [
  'PACKED',
  'PICKUP_SCHEDULED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'RTO_IN_TRANSIT',
  'RTO_DELIVERED',
  'LOST',
];

const NOT_FOUND = () => new AppError('NOT_FOUND', 'Order not found.');
const scopeOf = (auth: AuthContext) => (auth.role === 'ADMIN' ? null : auth.pickupLocationIds);
const inScope = (auth: AuthContext, locationId: string) =>
  auth.role === 'ADMIN' || auth.pickupLocationIds.includes(locationId);
/** Partner sees the first name only (D-40, Phase 7 §7.1) — the label carries the address. */
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';

export function createPartnerService(deps: {
  db: Db;
  settings: SettingsService;
  jobs: JobQueue;
  privateStorage: PrivateStorage;
  logger: Logger;
  now?: () => Date;
}) {
  const { db, settings, jobs, privateStorage, logger } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async pickupLocation(id: string) {
      const location = await repo.findPickupLocation(db, id);
      if (!location) throw new AppError('NOT_FOUND', 'Kitchen not found.');
      return location;
    },

    /** ADMIN: every kitchen. KITCHEN_PARTNER: only their own. */
    pickupLocations: (auth: AuthContext) => repo.listPickupLocations(db, scopeOf(auth)),

    /** GET /partner/orders — packing queue, oldest first (Phase 7 §7.5). */
    async orders(
      auth: AuthContext,
      status: 'AWAITING_PACKING' | 'PACKED' | 'PICKUP_SCHEDULED',
    ): Promise<PartnerOrdersResponse> {
      const scope = scopeOf(auth);
      const cutoffHourIst = await settings.getSetting(db, 'pickup_cutoff_hour_ist', CutoffHour);
      const [rows, toPack] = await Promise.all([
        repo.listDeskOrders(db, status, scope),
        repo.countAwaitingPacking(db, scope),
      ]);
      const items = await repo.listDeskItems(
        db,
        rows.map((r) => r.id),
      );
      const packBy = nextCutoff(now(), cutoffHourIst).toISOString();
      return {
        toPack,
        cutoffHourIst,
        orders: rows.map((o) => {
          const lines = new Map<string, PartnerOrdersResponse['orders'][number]['items'][number]>();
          for (const it of items.filter((i) => i.order_id === o.id)) {
            const line = lines.get(it.order_item_id) ?? {
              title: it.title,
              sku: it.sku,
              netWeightG: it.net_weight_g,
              quantity: it.quantity,
              batches: [],
            };
            if (it.batch_code && it.allocated) line.batches.push({ batchCode: it.batch_code, quantity: it.allocated });
            lines.set(it.order_item_id, line);
          }
          return {
            orderCode: o.order_code,
            status: o.status,
            items: [...lines.values()],
            customerFirstName: firstName(o.customer_name),
            city: o.city,
            state: o.state,
            courierName: o.courier_name,
            awbCode: o.awb_code,
            labelReady: o.label_key !== null,
            confirmedAt: o.confirmed_at?.toISOString() ?? null,
            packBy,
            pickupDate: o.pickup_scheduled_for,
          };
        }),
      };
    },

    /**
     * POST /partner/orders/:code/mark-packed (Phase 7 §7.7). Idempotent by state: already packed →
     * 200 `changed: false` (the offline queue replays with the same Idempotency-Key). Commit →
     * SHIPROCKET_SCHEDULE_PICKUP (Phase 6).
     */
    async markPacked(
      auth: AuthContext,
      orderCode: string,
      p: { idempotencyKey: string; checklist: PackingChecklist },
    ): Promise<MarkPackedResponse> {
      const cutoff = await settings.getSetting(db, 'pickup_cutoff_hour_ist', CutoffHour);
      const outcome = await db.transaction(async (client) => {
        const order = await orderStore.findByCode(client, orderCode, 'update');
        if (!order || !inScope(auth, order.pickup_location_id)) throw NOT_FOUND();
        if (PACKED_OR_LATER.includes(order.status)) return { order, changed: false };
        if (order.status === 'CANCELLED') {
          throw new AppError('INVALID_STATE', 'This order was cancelled — do not pack it.', {
            reason: 'ORDER_CANCELLED',
            status: order.status,
          });
        }
        if (order.status !== 'AWAITING_PACKING') {
          throw new AppError('INVALID_STATE', 'This order is not ready to pack yet (label pending).', {
            reason: 'NOT_READY',
            status: order.status,
          });
        }
        await transitionOrder(client, order.id, 'AWAITING_PACKING', 'PACKED', {
          actor: auth.role === 'ADMIN' ? 'ADMIN' : 'KITCHEN_PARTNER',
          actorId: auth.userId,
          reason: 'packed at the desk',
          metadata: { checklist: p.checklist, idempotencyKey: p.idempotencyKey },
        });
        return { order: (await orderStore.findById(client, order.id))!, changed: true };
      });

      const { order, changed } = outcome;
      if (changed) {
        try {
          await jobs.add('SHIPROCKET_SCHEDULE_PICKUP', { orderId: order.id }, jobIds.pickup(order.id));
        } catch (err) {
          // PICKUP_BATCH also dates any PACKED parcel it finds, so the pickup still happens
          logger.error({ err, orderCode }, 'pickup enqueue failed');
        }
      }
      return {
        orderCode: order.order_code,
        status: order.status,
        changed,
        pickupDate: order.packed_at ? pickupDateFor(order.packed_at, cutoff) : null,
      };
    },

    /** GET /partner/labels/a4 — merged 4-up A4 PDF (Phase 7 §7.6), every included label audited. */
    async a4Labels(auth: AuthContext, orderCodes: string[], ip: string | null): Promise<SignedUrlResponse> {
      const rows = await repo.findLabelKeys(db, orderCodes);
      const byCode = new Map(rows.map((r) => [r.order_code, r]));
      const missing = orderCodes.filter((c) => {
        const r = byCode.get(c);
        return !r || !inScope(auth, r.pickup_location_id);
      });
      if (missing.length) throw new AppError('NOT_FOUND', 'Order not found.', { orderCodes: missing });
      const notReady = orderCodes.filter((c) => !byCode.get(c)!.label_key);
      if (notReady.length) throw new AppError('NOT_FOUND', 'Some labels are not ready yet.', { orderCodes: notReady });

      const pdfs = await Promise.all(orderCodes.map((c) => privateStorage.get(byCode.get(c)!.label_key!)));
      if (pdfs.some((p) => p === null)) throw new AppError('NOT_FOUND', 'A label file is missing — ask the admin.');
      const sheet = await renderA4LabelSheet(pdfs as Uint8Array[]);
      const key = `labels/a4/${createHash('sha256').update(orderCodes.join(',')).digest('hex').slice(0, 24)}.pdf`;
      await privateStorage.put(key, sheet, 'application/pdf');
      for (const c of orderCodes) {
        await audit(db, {
          actorId: auth.userId,
          action: 'LABEL_VIEW',
          entityType: 'order',
          entityId: byCode.get(c)!.order_id,
          after: { orderCode: c, sheet: 'A4' },
          ip,
        });
      }
      const { url, expiresAt } = await privateStorage.signedGetUrl(key, SIGNED_URL_TTL_SEC);
      return { url, expiresAt: expiresAt.toISOString() };
    },

    /** GET /partner/manifests — latest pickup manifests (Phase 6 §6.7 → desk). */
    async manifests(auth: AuthContext): Promise<PartnerManifestsResponse> {
      const rows = await repo.listManifests(db, scopeOf(auth));
      return {
        manifests: await Promise.all(
          rows.map(async (m) => {
            const { url, expiresAt } = await privateStorage.signedGetUrl(m.manifest_key, SIGNED_URL_TTL_SEC);
            return {
              pickupDate: m.pickup_date,
              kitchenCode: m.kitchen_code,
              orderCodes: m.order_codes,
              url,
              expiresAt: expiresAt.toISOString(),
            };
          }),
        ),
      };
    },
  };
}

export type PartnerService = ReturnType<typeof createPartnerService>;
