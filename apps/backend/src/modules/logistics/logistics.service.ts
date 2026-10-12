import {
  canTransition,
  computeParcel,
  isPastCutoff,
  istDateOf,
  mapShiprocketStatus,
  normalizeTrackingStatus,
  pickupDateFor,
  type LabelUrlResponse,
  type OrderRow,
  type OrderStatus,
} from '@pk/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db, Queryable } from '../../config/db';
import type { ErrorReporter } from '../../config/sentry';
import type { CourierOption, ShiprocketApi, ShiprocketOrderPayload } from '../../integrations/shiprocket/client';
import { parseShiprocketTime, shiprocketOrderDate } from '../../integrations/shiprocket/time';
import { SIGNED_URL_TTL_SEC, type PrivateStorage } from '../../integrations/storage/private';
import { PermanentJobError } from '../../jobs/errors';
import { jobIds, type JobName, type JobPayloads, type JobQueue, type NotifyTemplate } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { orderStore, transitionOrder } from '../orders/orders.service';
import type { SettingsService } from '../settings/settings.service';
import * as repo from './logistics.repository';

const Rating = z.coerce.number().min(0).max(5);
const EtdDays = z.coerce.number().int().min(1).max(30);
const CutoffHour = z.coerce.number().int().min(0).max(23);
const WalletMin = z.coerce.number().int().nonnegative();

/** Charged weight above declared + 10 % = courier weight dispute (Phase 6 §6.12). */
const WEIGHT_DISPUTE_RATIO = 1.1;
/** PICKUP_SCHEDULED for longer than this without a courier scan = "pickup missed". */
const PICKUP_MISSED_MS = 48 * 3600_000;
const POLL_CONCURRENCY = 2;

/** Order status → customer template (07 §6). Phase 8 sends them. */
const NOTIFY_ON: Partial<Record<OrderStatus, NotifyTemplate>> = {
  IN_TRANSIT: 'order_shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered_storage_tip',
  DELIVERY_FAILED: 'delivery_attempt_failed',
};
/** Statuses the admin must hear about (NDR queue, RTO, loss). */
const ALERT_ON: readonly OrderStatus[] = ['DELIVERY_FAILED', 'RTO_IN_TRANSIT', 'RTO_DELIVERED', 'LOST'];

export interface TrackingInput {
  awb: string;
  statusText: string;
  statusId: number | null;
  eventTime: Date;
  location: string | null;
  source: 'WEBHOOK' | 'POLL';
  raw: unknown;
}

export type TrackingOutcome =
  { kind: 'unknown_awb' } | { kind: 'duplicate' } | { kind: 'stored'; applied: OrderStatus[]; ignored: boolean };

/**
 * Courier selection (Phase 6 §6.5): rating ≥ min, ETD ≤ max days, cheapest first, faster on a tie.
 * Nothing passes → cheapest overall, flagged for the admin.
 */
export function selectCourier(
  options: readonly CourierOption[],
  rules: { minRating: number; maxEtdDays: number },
): { courier: CourierOption; fallback: boolean } | null {
  if (options.length === 0) return null;
  const byCost = (a: CourierOption, b: CourierOption) =>
    a.ratePaise - b.ratePaise || (a.etdDays ?? 99) - (b.etdDays ?? 99) || a.courierId - b.courierId;
  const good = options.filter(
    (o) => (o.rating ?? 0) >= rules.minRating && o.etdDays !== null && o.etdDays <= rules.maxEtdDays,
  );
  if (good.length) return { courier: [...good].sort(byCost)[0]!, fallback: false };
  return { courier: [...options].sort(byCost)[0]!, fallback: true };
}

const rupees = (paise: number) => Math.round(paise) / 100;
const addDaysIst = (from: Date, days: number) => istDateOf(new Date(from.getTime() + days * 86_400_000));

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1
    ? { first: parts.slice(0, -1).join(' '), last: parts.at(-1)! }
    : { first: parts[0]!, last: '' };
}

export function createLogisticsService(deps: {
  db: Db;
  settings: SettingsService;
  shiprocket: ShiprocketApi;
  privateStorage: PrivateStorage;
  jobs: JobQueue;
  logger: Logger;
  reporter: ErrorReporter;
  now?: () => Date;
}) {
  const { db, settings, shiprocket, privateStorage, jobs, logger, reporter } = deps;
  const now = deps.now ?? (() => new Date());
  const log = logger.child({ module: 'logistics' });

  /** Enqueue after COMMIT; failures are logged (reconcile sweepers / next poll pick the work up). */
  async function enqueue<N extends JobName>(name: N, data: JobPayloads[N], id: string) {
    try {
      await jobs.add(name, data, id);
    } catch (err) {
      log.error({ err, job: name, jobId: id }, 'enqueue failed');
    }
  }

  async function alert(kind: string, orderId: string | null, message: string, subject?: string): Promise<void> {
    log.warn({ kind, orderId }, `admin alert: ${message}`);
    await enqueue('ADMIN_ALERT', { kind, orderId, message }, jobIds.alert(kind, subject ?? orderId ?? 'account'));
  }

  async function flag(orderId: string, issue: string): Promise<void> {
    await orderStore.appendOpsIssue(db, orderId, issue.slice(0, 500));
  }

  async function loadOrder(q: Queryable, orderId: string, lock: 'none' | 'update' = 'none'): Promise<OrderRow> {
    const order = await orderStore.findById(q, orderId, lock);
    if (!order) throw new PermanentJobError(`order ${orderId} not found`);
    return order;
  }

  /** Cancels whatever Shiprocket has for this order (AWB first, else the order). Idempotent. */
  async function cancelBooking(orderId: string): Promise<'cancelled' | 'nothing'> {
    const s = await repo.findShipmentByOrderId(db, orderId);
    if (!s || s.cancelled_at) return 'nothing';
    if (s.awb_code) await shiprocket.cancelShipment([s.awb_code]);
    else if (s.shiprocket_order_id) await shiprocket.cancelOrder([s.shiprocket_order_id]);
    await repo.markCancelled(db, s.id);
    return s.awb_code || s.shiprocket_order_id ? 'cancelled' : 'nothing';
  }

  /** The order moved on (cancelled) while we were talking to Shiprocket → undo the booking now. */
  async function stillConfirmed(orderId: string): Promise<boolean> {
    const order = await loadOrder(db, orderId);
    if (order.status === 'CONFIRMED') return true;
    if (order.status === 'CANCELLED') await cancelBooking(orderId);
    return false;
  }

  async function buildPayload(order: OrderRow, pickupName: string, parcel: ReturnType<typeof computeParcel>) {
    const items = await orderStore.listItems(db, order.id);
    const a = order.shipping_address;
    const name = splitName(a.fullName);
    const payload: ShiprocketOrderPayload = {
      order_id: order.order_code,
      order_date: shiprocketOrderDate(order.confirmed_at ?? order.created_at),
      pickup_location: pickupName,
      billing_customer_name: name.first,
      billing_last_name: name.last,
      billing_address: a.line1,
      billing_address_2: [a.line2, a.landmark].filter(Boolean).join(', '),
      billing_city: a.city,
      billing_pincode: a.pincode,
      billing_state: a.state,
      billing_country: 'India',
      billing_email: order.customer_email ?? '',
      billing_phone: a.phone.replace(/^\+91/, ''),
      shipping_is_billing: true,
      order_items: items.map((i) => ({
        name: i.title,
        sku: i.sku,
        units: i.quantity,
        selling_price: rupees(i.unit_price_paise),
        hsn: i.hsn_code,
      })),
      payment_method: 'Prepaid',
      sub_total: rupees(order.total_paise),
      length: parcel.lengthCm,
      breadth: parcel.breadthCm,
      height: parcel.heightCm,
      weight: parcel.deadWeightG / 1000,
      ...(order.invoice_number ? { invoice_number: order.invoice_number } : {}),
    };
    return payload;
  }

  async function applyTransitions(
    client: Queryable,
    order: OrderRow,
    target: OrderStatus,
    reason: string,
  ): Promise<OrderStatus[]> {
    const path: OrderStatus[] = [];
    if (order.status === target) return path;
    if (canTransition(order.status, target, 'SHIPROCKET')) path.push(target);
    // A missed first scan (webhook lost, poll late): PICKUP_SCHEDULED → IN_TRANSIT → target
    else if (
      order.status === 'PICKUP_SCHEDULED' &&
      target !== 'IN_TRANSIT' &&
      canTransition('IN_TRANSIT', target, 'SHIPROCKET')
    ) {
      path.push('IN_TRANSIT', target);
    } else return path; // out-of-order / not allowed → event stored only (07 §1.2)

    let from = order.status;
    for (const to of path) {
      await transitionOrder(client, order.id, from, to, {
        actor: 'SHIPROCKET',
        reason: to === 'RTO_DELIVERED' ? `${reason} — no restock (D-31)` : reason,
        metadata: to === 'RTO_DELIVERED' ? { restock: false } : {},
      });
      from = to;
    }
    return path;
  }

  async function processTracking(e: TrackingInput): Promise<TrackingOutcome> {
    const shipment = await repo.findShipmentByAwb(db, e.awb);
    if (!shipment) return { kind: 'unknown_awb' };
    const statusText = normalizeTrackingStatus(e.statusText) || 'UNKNOWN';
    const signal = mapShiprocketStatus(statusText, e.statusId);

    const result = await db.transaction(async (client) => {
      const order = await loadOrder(client, shipment.order_id, 'update');
      const fresh = await repo.insertTrackingEvent(client, {
        shipmentId: shipment.id,
        statusCode: e.statusId === null ? null : String(e.statusId),
        statusText,
        location: e.location,
        eventTime: e.eventTime,
        source: e.source,
        raw: e.raw,
      });
      if (!fresh) return null;
      await repo.updateLastStatus(client, shipment.id, statusText, e.eventTime);
      if (signal.kind !== 'status') return { order, applied: [] as OrderStatus[], ignored: signal.kind === 'none' };
      const applied = await applyTransitions(client, order, signal.status, `courier: ${statusText}`);
      if (applied.includes('RTO_DELIVERED')) {
        await orderStore.appendOpsIssue(
          client,
          order.id,
          'RTO_DELIVERED: decide refund (Q-04); jars discarded, no restock (D-31)',
        );
      }
      if (applied.includes('LOST'))
        await orderStore.appendOpsIssue(client, order.id, `LOST: courier reported ${statusText}`);
      return { order, applied, ignored: applied.length === 0 };
    });
    if (!result) return { kind: 'duplicate' };

    // Side-effects after COMMIT (D-30)
    for (const status of result.applied) {
      const template = NOTIFY_ON[status];
      if (template) {
        await enqueue(
          'ORDER_STATUS_NOTIFY',
          { orderId: shipment.order_id, template },
          jobIds.notify(template, shipment.order_id),
        );
      }
      if (ALERT_ON.includes(status)) {
        await alert(status, shipment.order_id, `Order ${result.order.order_code} → ${status} (${statusText})`);
      }
    }
    if (signal.kind === 'alert') {
      await alert(signal.reason, shipment.order_id, `Order ${result.order.order_code}: courier says ${statusText}`);
    }
    return { kind: 'stored', applied: result.applied, ignored: result.ignored };
  }

  return {
    // ── 6.5 SHIPROCKET_CREATE_ORDER: CONFIRMED → booking → AWB → label job ─────────────────────
    async bookShipment(orderId: string): Promise<{ status: string; awb?: string }> {
      const order = await loadOrder(db, orderId);
      if (order.status !== 'CONFIRMED' || order.payment_status !== 'PAID') {
        if (order.status === 'CANCELLED') await cancelBooking(orderId);
        return { status: 'skipped' };
      }
      const location = await repo.findPickupLocation(db, order.pickup_location_id);
      if (!location?.shiprocket_pickup_name) {
        throw new PermanentJobError(
          `kitchen ${location?.code ?? order.pickup_location_id} has no Shiprocket pickup name`,
        );
      }

      const packaging = await repo.listItemPackaging(db, orderId);
      if (packaging.some((p) => p.packed_weight_g === null))
        throw new PermanentJobError('a product has no packed weight');
      const parcel = computeParcel(
        packaging.map((p) => ({
          quantity: p.quantity,
          netWeightG: p.net_weight_g,
          packedWeightG: p.packed_weight_g!,
          lengthCm: p.package_length_cm,
          breadthCm: p.package_breadth_cm,
          heightCm: p.package_height_cm,
        })),
      );
      log.info(
        {
          orderId,
          deadWeightG: parcel.deadWeightG,
          volumetricWeightG: parcel.volumetricWeightG,
          warnings: parcel.warnings,
        },
        'parcel computed',
      );

      let shipment = await repo.ensureShipment(db, {
        orderId,
        deadWeightG: parcel.deadWeightG,
        volumetricWeightG: parcel.volumetricWeightG,
        lengthCm: parcel.lengthCm,
        breadthCm: parcel.breadthCm,
        heightCm: parcel.heightCm,
      });
      if (shipment.awb_code) {
        // Booked already (re-run) — only the label step may be missing
        if (!shipment.label_key) await enqueue('FETCH_AND_STORE_LABEL', { orderId }, jobIds.label(orderId));
        return { status: 'already_booked', awb: shipment.awb_code };
      }
      await repo.incrementBookingAttempts(db, shipment.id);
      if (shipment.booking_attempts === 0) {
        if (parcel.warnings.includes('OVERSIZE_SPLIT_NEEDED'))
          await flag(orderId, 'OVERSIZE_PARCEL: split into boxes (v2)');
        if (parcel.warnings.includes('OVER_WEIGHT_TARGET'))
          log.warn({ orderId }, 'single 250 g jar over the 500 g slab (D-34)');
      }

      // (1) Shiprocket order — skipped when a previous attempt already created it
      if (!shipment.shiprocket_order_id || !shipment.shiprocket_shipment_id) {
        const created = await shiprocket.createOrder(
          await buildPayload(order, location.shiprocket_pickup_name, parcel),
        );
        await repo.setShiprocketIds(db, shipment.id, created.shiprocketOrderId, created.shipmentId);
        shipment = (await repo.findShipmentByOrderId(db, orderId))!;
        if (!(await stillConfirmed(orderId))) return { status: 'cancelled_meanwhile' };
      }

      // (2) Courier + AWB
      const [minRating, maxEtdDays] = await Promise.all([
        settings.getSetting(db, 'min_courier_rating', Rating),
        settings.getSetting(db, 'max_courier_etd_days', EtdDays),
      ]);
      const options = await shiprocket.checkServiceability({
        pickupPincode: location.pincode,
        deliveryPincode: order.shipping_address.pincode,
        weightKg: Math.max(parcel.chargeableWeightG, 1) / 1000,
      });
      const choice = selectCourier(options, { minRating, maxEtdDays });
      if (!choice) throw new PermanentJobError(`no courier serves pincode ${order.shipping_address.pincode}`);
      const assigned = await shiprocket.assignAwb(shipment.shiprocket_shipment_id!, choice.courier.courierId);
      await repo.setAwb(db, shipment.id, {
        awb: assigned.awb,
        courierId: choice.courier.courierId,
        courierName: assigned.courierName ?? choice.courier.courierName,
        freightPaise: choice.courier.ratePaise,
        etd: choice.courier.etdDays ? addDaysIst(now(), choice.courier.etdDays) : null,
      });
      if (choice.fallback) {
        await flag(
          orderId,
          `COURIER_FALLBACK: no courier met rating ≥ ${minRating} / ETD ≤ ${maxEtdDays}d; used cheapest`,
        );
      }
      if (!(await stillConfirmed(orderId))) return { status: 'cancelled_meanwhile' };

      // (3) Label in its own job (documents queue)
      await enqueue('FETCH_AND_STORE_LABEL', { orderId }, jobIds.label(orderId));
      return { status: 'booked', awb: assigned.awb };
    },

    // ── 6.6 FETCH_AND_STORE_LABEL: label PDF → private storage → AWAITING_PACKING ──────────────
    async fetchAndStoreLabel(orderId: string): Promise<{ status: string }> {
      const order = await loadOrder(db, orderId);
      const shipment = await repo.findShipmentByOrderId(db, orderId);
      if (!shipment?.awb_code || !shipment.shiprocket_shipment_id) return { status: 'no_awb' };
      if (order.status !== 'CONFIRMED' && shipment.label_key) return { status: 'done' };

      let key = shipment.label_key;
      if (!key) {
        const { labelUrl } = await shiprocket.generateLabel([shipment.shiprocket_shipment_id]);
        const pdf = await shiprocket.downloadDocument(labelUrl);
        key = `labels/${order.order_code}.pdf`;
        await privateStorage.put(key, pdf, 'application/pdf');
      }
      const labelKey = key;
      const moved = await db.transaction(async (client) => {
        const locked = await loadOrder(client, orderId, 'update');
        await repo.setLabelKey(client, shipment.id, labelKey);
        if (locked.status !== 'CONFIRMED') return false;
        await transitionOrder(client, orderId, 'CONFIRMED', 'AWAITING_PACKING', {
          actor: 'SYSTEM',
          reason: 'AWB assigned + label stored',
          metadata: { awb: shipment.awb_code, courier: shipment.courier_name },
        });
        return true;
      });
      return { status: moved ? 'awaiting_packing' : 'stored' };
    },

    // ── 6.7 Pickup: PACKED → day assigned → batch at cut-off → PICKUP_SCHEDULED ────────────────
    /** SHIPROCKET_SCHEDULE_PICKUP (enqueued on PACKED): fixes which day's batch the parcel joins. */
    async schedulePickup(orderId: string): Promise<{ pickupDate: string | null }> {
      const order = await loadOrder(db, orderId);
      if (order.status !== 'PACKED') return { pickupDate: null };
      const cutoff = await settings.getSetting(db, 'pickup_cutoff_hour_ist', CutoffHour);
      const date = pickupDateFor(order.packed_at ?? now(), cutoff);
      await repo.setPickupDateIfUnset(db, orderId, date);
      return { pickupDate: (await repo.findShipmentByOrderId(db, orderId))?.pickup_scheduled_for ?? date };
    },

    /**
     * PICKUP_BATCH (every 15 min): once today's cut-off has passed, one pickup + one manifest per
     * kitchen for every parcel due today or earlier (D-36). A failed kitchen batch retries next run.
     */
    async pickupBatch(): Promise<{ booked: number; failed: number }> {
      const at = now();
      const today = istDateOf(at);
      const cutoff = await settings.getSetting(db, 'pickup_cutoff_hour_ist', CutoffHour);
      const candidates = await repo.listPickupCandidates(db, 200);
      const due = new Map<string, repo.PickupCandidate[]>();
      for (const c of candidates) {
        const date = c.pickup_scheduled_for ?? pickupDateFor(c.packed_at ?? at, cutoff);
        if (!c.pickup_scheduled_for) await repo.setPickupDateIfUnset(db, c.order_id, date);
        if (date > today || (date === today && !isPastCutoff(at, cutoff))) continue;
        due.set(c.pickup_location_id, [...(due.get(c.pickup_location_id) ?? []), c]);
      }

      let booked = 0;
      let failed = 0;
      for (const [locationId, group] of due) {
        const ids = group.map((g) => g.shiprocket_shipment_id);
        try {
          const pickup = await shiprocket.generatePickup(ids, today);
          let manifestKey: string | null = null;
          try {
            const { manifestUrl } = await shiprocket.generateManifest(ids);
            if (manifestUrl) {
              const location = await repo.findPickupLocation(db, locationId);
              manifestKey = `manifests/${today}-${location?.code ?? locationId}-${group[0]!.order_code}.pdf`;
              await privateStorage.put(manifestKey, await shiprocket.downloadDocument(manifestUrl), 'application/pdf');
            }
          } catch (err) {
            // Pickup is booked; a missing manifest is printable from the Shiprocket panel
            log.error({ err, locationId }, 'manifest generation failed');
            manifestKey = null;
          }
          for (const g of group) {
            await db.transaction(async (client) => {
              const order = await loadOrder(client, g.order_id, 'update');
              await repo.setPickupBooked(client, g.shipment_id, {
                pickupToken: pickup.pickupToken,
                manifestKey,
                pickupDate: today,
              });
              if (order.status === 'PACKED') {
                await transitionOrder(client, g.order_id, 'PACKED', 'PICKUP_SCHEDULED', {
                  actor: 'SYSTEM',
                  reason: 'pickup booked',
                  metadata: { pickupDate: today },
                });
              }
            });
            booked += 1;
          }
        } catch (err) {
          failed += group.length;
          const message = (err as Error).message;
          for (const g of group) await repo.setLastError(db, g.order_id, `PICKUP: ${message}`);
          log.error({ err, locationId, count: group.length }, 'pickup batch failed — retry next run');
          await alert(
            'PICKUP_BATCH_FAILED',
            null,
            `Pickup request failed for ${group.length} parcel(s): ${message}`,
            `${today}-${locationId}`,
          );
        }
      }
      return { booked, failed };
    },

    // ── 6.8 SHIPROCKET_CANCEL_SHIPMENT ─────────────────────────────────────────────────────────
    async cancelShipment(orderId: string): Promise<{ status: string }> {
      const order = await loadOrder(db, orderId);
      if (order.status !== 'CANCELLED') return { status: 'order_not_cancelled' };
      return { status: await cancelBooking(orderId) };
    },

    // ── 6.9 / 6.10 Tracking (webhook + poll share processTracking) ─────────────────────────────
    processTracking,

    /** POLL_TRACKING (every 3 h): webhook-miss fallback + charged weight + "pickup missed" (6.10, 6.12). */
    async pollTracking(opts: { jitterMs?: number } = {}): Promise<{ polled: number; applied: number; failed: number }> {
      const jitterMs = opts.jitterMs ?? 500;
      const active = await repo.listActiveShipments(db, 500);
      let applied = 0;
      let failed = 0;
      const queue = [...active];
      const workerLoop = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          if (jitterMs > 0) await new Promise((r) => setTimeout(r, Math.random() * jitterMs));
          try {
            const track = await shiprocket.trackByAwb(s.awb_code);
            const events = track.activities
              .map((a) => ({ a, at: parseShiprocketTime(a.date) }))
              .filter((x): x is { a: (typeof track.activities)[number]; at: Date } => x.at !== null)
              .sort((x, y) => x.at.getTime() - y.at.getTime());
            for (const { a, at } of events) {
              const r = await processTracking({
                awb: s.awb_code,
                statusText: a.statusText,
                statusId: a.statusId,
                eventTime: at,
                location: a.location,
                source: 'POLL',
                raw: a,
              });
              if (r.kind === 'stored') applied += r.applied.length;
            }
            if (track.chargedWeightG && track.chargedWeightG !== s.charged_weight_g) {
              await repo.setChargedWeight(db, s.shipment_id, track.chargedWeightG);
              if (s.dead_weight_g && track.chargedWeightG > s.dead_weight_g * WEIGHT_DISPUTE_RATIO) {
                await flag(
                  s.order_id,
                  `WEIGHT_DISCREPANCY: charged ${track.chargedWeightG} g vs declared ${s.dead_weight_g} g`,
                );
                await alert(
                  'WEIGHT_DISCREPANCY',
                  s.order_id,
                  `Courier charged ${track.chargedWeightG} g, declared ${s.dead_weight_g} g`,
                );
              }
            }
            const current = await orderStore.findById(db, s.order_id);
            if (
              current?.status === 'PICKUP_SCHEDULED' &&
              s.pickup_requested_at &&
              now().getTime() - s.pickup_requested_at.getTime() > PICKUP_MISSED_MS
            ) {
              await alert(
                'PICKUP_MISSED',
                s.order_id,
                `Order ${current.order_code}: no courier scan 48 h after pickup booking`,
              );
            }
          } catch (err) {
            failed += 1;
            log.warn({ err, orderId: s.order_id }, 'tracking poll failed for shipment');
          }
        }
      };
      await Promise.all(Array.from({ length: POLL_CONCURRENCY }, () => workerLoop()));
      return { polled: active.length, applied, failed };
    },

    // ── 6.12 CHECK_WALLET_BALANCE (hourly) ─────────────────────────────────────────────────────
    async checkWallet(): Promise<{ balancePaise: number; low: boolean }> {
      const [balancePaise, min] = await Promise.all([
        shiprocket.getWalletBalancePaise(),
        settings.getSetting(db, 'shiprocket_wallet_min_paise', WalletMin),
      ]);
      const low = balancePaise < min;
      if (low) {
        await alert(
          'WALLET_LOW',
          null,
          `Shiprocket wallet ₹${(balancePaise / 100).toFixed(2)} is below ₹${(min / 100).toFixed(2)} — AWBs will fail`,
          istDateOf(now()),
        );
      }
      return { balancePaise, low };
    },

    /** Final failure of a logistics job (Phase 6 §6.1 dead letter): ops_issue + last_error + admin alert. */
    async jobGaveUp(job: JobName, orderId: string, error: string): Promise<void> {
      await flag(orderId, `${job}: ${error}`);
      await repo.setLastError(db, orderId, `${job}: ${error}`);
      reporter.capture(new Error(`${job} gave up: ${error}`), { job, orderId });
      await alert(
        job === 'SHIPROCKET_CANCEL_SHIPMENT' ? 'AWB_CANCEL_FAILED' : 'BOOKING_FAILED',
        orderId,
        `${job} failed: ${error}`,
      );
    },

    /** Label for the partner desk / admin (D-11): 5-min signed URL, every view audited. */
    async labelUrl(orderCode: string, auth: AuthContext, ip: string | null): Promise<LabelUrlResponse> {
      const order = await orderStore.findByCode(db, orderCode);
      const allowed =
        order &&
        (auth.role === 'ADMIN' ||
          (auth.role === 'KITCHEN_PARTNER' && auth.pickupLocationIds.includes(order.pickup_location_id)));
      if (!order || !allowed) throw new AppError('NOT_FOUND', 'Order not found.');
      const shipment = await repo.findShipmentByOrderId(db, order.id);
      if (!shipment?.label_key) throw new AppError('NOT_FOUND', 'The shipping label is not ready yet.');
      const { url, expiresAt } = await privateStorage.signedGetUrl(shipment.label_key, SIGNED_URL_TTL_SEC);
      await audit(db, {
        actorId: auth.userId,
        action: 'LABEL_VIEW',
        entityType: 'order',
        entityId: order.id,
        after: { orderCode, awb: shipment.awb_code },
        ip,
      });
      return { url, expiresAt: expiresAt.toISOString() };
    },

    /** Reconcile (every 5 min): AWB assigned but the label step never ran. */
    async reconcileLabels(): Promise<number> {
      const pending = await repo.listLabelPending(db, 200);
      for (const p of pending)
        await enqueue('FETCH_AND_STORE_LABEL', { orderId: p.order_id }, jobIds.label(p.order_id));
      return pending.length;
    },

    shipmentFor: (orderId: string) => repo.findShipmentByOrderId(db, orderId),
    /** Default kitchen's pincode — origin for storefront serviceability checks. */
    originPincode: () => repo.findDefaultPickupPincode(db),
    trackingEventsFor: (shipmentId: string) => repo.listTrackingEvents(db, shipmentId),
  };
}

export type LogisticsService = ReturnType<typeof createLogisticsService>;
