import {
  mapShiprocketStatus,
  type MyOrderDetail,
  type MyOrdersResponse,
  type OrderRow,
  type OrderStatus,
  type StatusLogRow,
  type TimelineEntry,
  type TrackResponse,
} from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { orderStore, type OrdersService } from '../orders/orders.service';
import { latestOrderRefund } from '../payments/refund-requests';
import * as repo from './tracking.repository';

/** 60 s response cache (Phase 8 §8.1). The key carries the order's + shipment's updated_at, so a
 *  status change or courier update (webhook / poll) invalidates it automatically. */
export const TRACK_CACHE_TTL_SEC = 60;
/** D-39: 10 lookups / 10 min per order code (per IP is on the route). */
export const TRACK_CODE_LIMIT = { max: 10, windowSec: 600 };

const NOT_FOUND = () => new AppError('NOT_FOUND', 'Order not found. Check the order code and phone number.');
const IST_OFFSET_MS = 5.5 * 3600_000;
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? '';
/** "Ambala_Hub (Haryana)" → "Ambala" — customers see the hub city, not courier facility codes. */
export function hubCity(location: string | null): string | null {
  if (!location) return null;
  const city = location.split(/[_(,]/)[0]!.trim();
  return city ? city.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
}

const STATUS_ENTRY: Partial<Record<OrderStatus, Omit<TimelineEntry, 'at' | 'detail'>>> = {
  CONFIRMED: { key: 'CONFIRMED', label: 'Order confirmed', tone: 'success' },
  PACKED: { key: 'PACKED', label: 'Airtight packed & sealed', tone: 'success' },
  IN_TRANSIT: { key: 'HANDED_TO_COURIER', label: 'Handed to courier', tone: 'info' },
  OUT_FOR_DELIVERY: { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery', tone: 'info' },
  DELIVERED: { key: 'DELIVERED', label: 'Delivered', tone: 'success' },
  DELIVERY_FAILED: { key: 'DELIVERY_FAILED', label: 'Delivery attempt failed — we can help', tone: 'warning' },
  RTO_IN_TRANSIT: { key: 'RTO', label: 'Returning to our kitchen', tone: 'warning' },
  RTO_DELIVERED: { key: 'RTO', label: 'Returned to our kitchen', tone: 'warning' },
  LOST: {
    key: 'DELIVERY_FAILED',
    label: 'Courier reported the parcel lost — our team will contact you',
    tone: 'destructive',
  },
  CANCELLED: { key: 'CANCELLED', label: 'Order cancelled', tone: 'destructive' },
};

/**
 * Timeline merge (Phase 8 §8.1): batch bottling date + our status log + courier scans, sorted by time.
 * Only the FIRST IN_TRANSIT is "handed to courier"; later in-transit scans show the hub city.
 */
export function buildTimeline(p: {
  items: repo.TrackItemRow[];
  logs: StatusLogRow[];
  scans: { status_text: string; status_code: string | null; location: string | null; event_time: Date }[];
  refund: { status: string; created_at: Date; processed_at: Date | null } | null;
}): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const bottled = p.items
    .filter((i) => i.manufactured_at && i.batch_code)
    .sort((a, b) => a.manufactured_at!.localeCompare(b.manufactured_at!))[0];
  if (bottled) {
    out.push({
      key: 'BOTTLED',
      label: 'Bottled in Himachal',
      at: new Date(Date.parse(`${bottled.manufactured_at}T09:00:00Z`) - IST_OFFSET_MS).toISOString(),
      detail: bottled.batch_code,
      tone: 'neutral',
    });
  }
  let handed = false;
  for (const l of p.logs) {
    const spec = STATUS_ENTRY[l.to_status];
    if (!spec) continue;
    if (l.to_status === 'IN_TRANSIT') {
      if (handed) continue; // back from OFD → IN_TRANSIT is a scan, not a second handover
      handed = true;
    }
    out.push({ ...spec, at: l.created_at.toISOString(), detail: null });
  }
  const transitScans = p.scans.filter((s) => {
    const signal = mapShiprocketStatus(s.status_text, s.status_code ? Number(s.status_code) : null);
    return signal.kind === 'status' && signal.status === 'IN_TRANSIT';
  });
  // The first transit scan IS the handover: fold it into "Handed to courier" (the courier's own
  // time + hub city) instead of listing it before the handover we logged when the webhook arrived.
  const handover = out.find((e) => e.key === 'HANDED_TO_COURIER');
  const [first, ...rest] = transitScans;
  if (handover && first) {
    if (first.event_time.toISOString() < handover.at) handover.at = first.event_time.toISOString();
    handover.detail = hubCity(first.location);
  }
  for (const s of handover ? rest : transitScans) {
    const city = hubCity(s.location);
    out.push({
      key: 'IN_TRANSIT',
      label: city ? `In transit — ${city}` : 'In transit',
      at: s.event_time.toISOString(),
      detail: city,
      tone: 'info',
    });
  }
  if (p.refund) {
    const done = p.refund.status === 'PROCESSED';
    out.push({
      key: 'REFUND',
      label: done
        ? 'Refund processed'
        : p.refund.status === 'FAILED'
          ? 'Refund delayed — our team is on it'
          : 'Refund initiated',
      at: (done && p.refund.processed_at ? p.refund.processed_at : p.refund.created_at).toISOString(),
      detail: p.refund.status,
      tone: done ? 'success' : p.refund.status === 'FAILED' ? 'warning' : 'info',
    });
  }
  const order = (e: TimelineEntry) =>
    [
      'BOTTLED',
      'CONFIRMED',
      'PACKED',
      'HANDED_TO_COURIER',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
      'DELIVERY_FAILED',
      'DELIVERED',
      'RTO',
      'CANCELLED',
      'REFUND',
    ].indexOf(e.key);
  return out.sort((a, b) => a.at.localeCompare(b.at) || order(a) - order(b));
}

export function createTrackingService(deps: { db: Db; redis: Redis; orders: OrdersService; logger: Logger }) {
  const { db, redis, orders, logger } = deps;

  async function view(order: OrderRow): Promise<TrackResponse> {
    const shipment = await repo.findTrackShipment(db, order.id);
    const key = `pk:track:${order.id}:${order.updated_at.getTime()}:${shipment?.updated_at.getTime() ?? 0}`;
    const cached = await redis.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as TrackResponse;

    const [items, logs, refund, scans] = await Promise.all([
      repo.listTrackItems(db, order.id),
      orderStore.listStatusLogs(db, order.id),
      latestOrderRefund(db, order.id),
      shipment ? repo.listScans(db, shipment.id) : Promise.resolve([]),
    ]);
    const res: TrackResponse = {
      orderCode: order.order_code,
      customerFirstName: firstName(order.customer_name),
      destinationCity: order.shipping_address.city,
      status: order.status,
      paymentStatus: order.payment_status,
      items: items.map((i) => ({
        title: i.title,
        netWeightG: i.net_weight_g,
        quantity: i.quantity,
        batchCode: i.batch_code,
        manufacturedAt: i.manufactured_at,
      })),
      courier: shipment?.awb_code
        ? {
            name: shipment.courier_name,
            awb: shipment.awb_code,
            trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(shipment.awb_code)}`,
          }
        : null,
      etd: shipment?.etd ?? null,
      timeline: buildTimeline({ items, logs, scans, refund }),
      refund: refund ? { status: refund.status, amountPaise: refund.amount_paise } : null,
      updatedAt: new Date(Math.max(order.updated_at.getTime(), shipment?.updated_at.getTime() ?? 0)).toISOString(),
    };
    await redis
      .set(key, JSON.stringify(res), 'EX', TRACK_CACHE_TTL_SEC)
      .catch((err: unknown) => logger.warn({ err }, 'track cache write failed'));
    return res;
  }

  return {
    /** POST /track — code + phone (D-39). Same 404 for unknown code and wrong phone. */
    async track(orderCode: string, phone: string): Promise<TrackResponse> {
      const rl = `pk:rl:track-code:${orderCode}`;
      const n = await redis.incr(rl);
      if (n === 1) await redis.expire(rl, TRACK_CODE_LIMIT.windowSec);
      if (n > TRACK_CODE_LIMIT.max) {
        throw new AppError('RATE_LIMITED', 'Too many lookups for this order. Please try again in a few minutes.', {
          retryAfterSeconds: Math.max(await redis.ttl(rl), 1),
        });
      }
      const order = await orderStore.findByCode(db, orderCode);
      if (
        !order ||
        order.customer_phone !== phone ||
        order.status === 'PENDING_PAYMENT' ||
        order.status === 'EXPIRED'
      ) {
        throw NOT_FOUND();
      }
      return view(order);
    },

    /** GET /me/orders — OTP-signed-in customer (D-18). */
    async myOrders(auth: AuthContext, page: number, pageSize: number): Promise<MyOrdersResponse> {
      const rows = await repo.listMyOrders(db, auth.userId, page, pageSize);
      return {
        page,
        pageSize,
        total: rows[0]?.total ?? (page === 1 ? 0 : ((await repo.listMyOrders(db, auth.userId, 1, 1))[0]?.total ?? 0)),
        orders: rows.map((r) => ({
          orderCode: r.order_code,
          status: r.status,
          paymentStatus: r.payment_status,
          totalPaise: r.total_paise,
          itemCount: r.item_count,
          firstItemTitle: r.first_item_title,
          createdAt: r.created_at.toISOString(),
        })),
      };
    },

    /** GET /me/orders/:code — owner only (user_id or verified phone); otherwise 404. */
    async myOrder(auth: AuthContext, orderCode: string): Promise<MyOrderDetail> {
      // statusFor() enforces ownership (session owner) and gives totals / invoice / cancel flags
      const status = await orders.statusFor(orderCode, { auth });
      if (status.status === 'PENDING_PAYMENT' || status.status === 'EXPIRED') throw NOT_FOUND();
      const order = (await orderStore.findByCode(db, orderCode))!;
      return {
        ...(await view(order)),
        totalPaise: status.totalPaise,
        subtotalPaise: status.subtotalPaise,
        shippingFeePaise: status.shippingFeePaise,
        invoiceAvailable: status.invoiceAvailable,
        canCancel: status.canCancel,
        createdAt: status.createdAt,
      };
    },
  };
}

export type TrackingService = ReturnType<typeof createTrackingService>;
