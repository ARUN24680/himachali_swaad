import {
  canTransition,
  maskPhone,
  type AdminCustomerDetail,
  type AdminDashboardResponse,
  type AdminOrderDetail,
  type AdminOrderRow,
  type AdminOrdersResponse,
  type AdminOrderTab,
  type AdminRefundRequest,
  type ExpiryAlertsResponse,
} from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import { jobIds, type JobQueue } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { orderStore } from '../orders/orders.service';
import { refundablePaise, requestAdminRefund } from '../payments/refund-requests';
import type { SettingsService } from '../settings/settings.service';
import { buildTimeline } from '../tracking/tracking.service';
import type { WebhooksService } from '../webhooks/webhooks.service';
import * as repo from './admin.repository';

const DASHBOARD_CACHE_KEY = 'pk:admin:dashboard';
const DASHBOARD_TTL_SEC = 60;
const Days = z.coerce.number().int().min(0).max(365);
const NOT_FOUND = () => new AppError('NOT_FOUND', 'Order not found.');

const toRow = (r: repo.AdminOrderListRow): AdminOrderRow => ({
  orderCode: r.order_code,
  createdAt: r.created_at.toISOString(),
  customerName: r.customer_name,
  city: r.city,
  state: r.state,
  itemsSummary: r.items_summary ?? '',
  totalPaise: r.total_paise,
  paymentStatus: r.payment_status,
  status: r.status,
  courierName: r.courier_name,
  awbCode: r.awb_code,
  opsIssue: r.ops_issue !== null,
});

export interface AdminActor {
  auth: AuthContext;
  ip: string | null;
}

/**
 * Admin console read models + order actions (Phase 9 §9.2–9.6, §9.11). Every mutation writes an
 * admin_audit_log row in the same transaction as the change.
 */
export function createAdminService(deps: {
  db: Db;
  redis: Redis;
  jobs: JobQueue;
  settings: SettingsService;
  webhooks: WebhooksService;
  logger: Logger;
}) {
  const { db, redis, jobs, settings, webhooks, logger } = deps;

  async function sellableBufferDays(): Promise<number> {
    const [min, transit] = await Promise.all([
      settings.getSetting(db, 'min_remaining_shelf_days', Days),
      settings.getSetting(db, 'transit_buffer_days', Days),
    ]);
    return min + transit;
  }

  async function orderOr404(orderCode: string) {
    const order = await orderStore.findByCode(db, orderCode);
    if (!order) throw NOT_FOUND();
    return order;
  }

  async function enqueue(fn: () => Promise<void>, what: string) {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, what }, 'admin enqueue failed');
    }
  }

  return {
    // ── §9.2 Dashboard ───────────────────────────────────────────────────────────────────────
    async dashboard(): Promise<AdminDashboardResponse> {
      const cached = await redis.get(DASHBOARD_CACHE_KEY).catch(() => null);
      if (cached) return JSON.parse(cached) as AdminDashboardResponse;
      const [n, perDay, byProduct] = await Promise.all([
        repo.dashboardNumbers(db, await sellableBufferDays()),
        repo.ordersPerDay(db, 30),
        repo.revenueByProductThisMonth(db),
      ]);
      const res: AdminDashboardResponse = {
        awaitingPacking: n.awaiting_packing,
        needsAttention: n.needs_attention,
        ndr: n.ndr,
        inTransit: n.in_transit,
        revenueToday: { grossPaise: n.today_gross, exGstPaise: n.today_ex, orders: n.today_orders },
        revenueMonth: { grossPaise: n.month_gross, exGstPaise: n.month_ex, orders: n.month_orders },
        sellableJars: n.sellable_jars,
        batchesExpiringIn30Days: n.expiring_30,
        ordersPerDay: perDay.map((d) => ({ date: d.date, orders: d.orders, grossPaise: d.gross_paise })),
        revenueByProduct: byProduct.map((p) => ({ title: p.title, jars: p.jars, grossPaise: p.gross_paise })),
        generatedAt: new Date().toISOString(),
      };
      await redis.set(DASHBOARD_CACHE_KEY, JSON.stringify(res), 'EX', DASHBOARD_TTL_SEC).catch(() => undefined);
      return res;
    },

    // ── §9.3 Orders ──────────────────────────────────────────────────────────────────────────
    async orders(p: {
      tab: AdminOrderTab;
      statuses: string[];
      q?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
      sort: 'created_desc' | 'created_asc' | 'total_desc' | 'total_asc';
    }): Promise<AdminOrdersResponse> {
      const filter = { q: p.q, from: p.from, to: p.to, statuses: p.statuses };
      const [rows, counts] = await Promise.all([
        repo.listAdminOrders(db, { ...filter, ...p }),
        repo.countAdminOrdersByTab(db, filter),
      ]);
      return {
        orders: rows.map(toRow),
        page: p.page,
        pageSize: p.pageSize,
        total: rows[0]?.total ?? counts[p.tab] ?? 0,
        counts,
      };
    },

    // ── §9.4 Order detail ────────────────────────────────────────────────────────────────────
    async orderDetail(orderCode: string): Promise<AdminOrderDetail> {
      const o = await orderOr404(orderCode);
      const [items, allocations, logs, payments, refunds, shipment, notifications, notes, kitchen, refundable] =
        await Promise.all([
          orderStore.listItems(db, o.id),
          repo.listAllocations(db, o.id),
          orderStore.listStatusLogs(db, o.id),
          repo.listPayments(db, o.id),
          repo.listRefunds(db, o.id),
          repo.findShipmentDetail(db, o.id),
          repo.listNotifications(db, o.id),
          repo.listOrderNotes(db, o.id),
          repo.findKitchen(db, o.pickup_location_id),
          refundablePaise(db, o.id),
        ]);
      const events = shipment ? await repo.listTrackingEvents(db, shipment.id) : [];
      const latestRefund = refunds.filter((r) => r.reason !== 'DUPLICATE_PAYMENT').at(-1) ?? null;
      const timeline = buildTimeline({
        items: items.map((i) => {
          const first = allocations
            .filter((a) => a.order_item_id === i.id)
            .sort((a, b) => a.manufactured_at.localeCompare(b.manufactured_at))[0];
          return {
            order_item_id: i.id,
            title: i.title,
            net_weight_g: i.net_weight_g,
            quantity: i.quantity,
            batch_code: first?.batch_code ?? null,
            manufactured_at: first?.manufactured_at ?? null,
          };
        }),
        logs,
        scans: events.map((e) => ({
          status_text: e.status_text,
          status_code: null,
          location: e.location,
          event_time: e.event_time,
        })),
        refund: latestRefund
          ? {
              status: latestRefund.status,
              created_at: latestRefund.created_at,
              processed_at: latestRefund.processed_at,
            }
          : null,
      });
      const captured = payments.some((p) => p.status === 'CAPTURED');
      return {
        order: {
          orderCode: o.order_code,
          status: o.status,
          paymentStatus: o.payment_status,
          createdAt: o.created_at.toISOString(),
          confirmedAt: o.confirmed_at?.toISOString() ?? null,
          packedAt: o.packed_at?.toISOString() ?? null,
          shippedAt: o.shipped_at?.toISOString() ?? null,
          deliveredAt: o.delivered_at?.toISOString() ?? null,
          cancelledAt: o.cancelled_at?.toISOString() ?? null,
          cancelReason: o.cancel_reason,
          opsIssue: o.ops_issue,
          subtotalPaise: o.subtotal_paise,
          shippingFeePaise: o.shipping_fee_paise,
          discountPaise: o.discount_paise,
          totalPaise: o.total_paise,
          taxPaise: o.tax_paise,
          invoiceNumber: o.invoice_number,
          invoiceAvailable: o.invoice_key !== null,
          whatsappOptIn: o.whatsapp_opt_in,
        },
        customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email, userId: o.user_id },
        shippingAddress: o.shipping_address,
        kitchen,
        items: items.map((i) => ({
          title: i.title,
          sku: i.sku,
          quantity: i.quantity,
          unitPricePaise: i.unit_price_paise,
          totalPricePaise: i.total_price_paise,
          allocations: allocations
            .filter((a) => a.order_item_id === i.id)
            .map((a) => ({
              batchCode: a.batch_code,
              quantity: a.quantity,
              manufacturedAt: a.manufactured_at,
              expiryDate: a.expiry_date,
              status: a.status,
            })),
        })),
        timeline,
        statusLog: logs.map((l) => ({
          from: l.from_status,
          to: l.to_status,
          actor: l.actor_type,
          reason: l.reason,
          at: l.created_at.toISOString(),
        })),
        payments: payments.map((p) => ({
          id: p.id,
          gatewayPaymentId: p.gateway_payment_id,
          amountPaise: p.amount_paise,
          method: p.method,
          status: p.status,
          feePaise: p.fee_paise,
          feeTaxPaise: p.fee_tax_paise,
          errorCode: p.error_code,
          createdAt: p.created_at.toISOString(),
        })),
        refunds: refunds.map((r) => ({
          id: r.id,
          amountPaise: r.amount_paise,
          reason: r.reason,
          status: r.status,
          notes: r.notes,
          createdAt: r.created_at.toISOString(),
          processedAt: r.processed_at?.toISOString() ?? null,
        })),
        refundablePaise: refundable,
        shipment: shipment
          ? {
              courierName: shipment.courier_name,
              awbCode: shipment.awb_code,
              etd: shipment.etd,
              deadWeightG: shipment.dead_weight_g,
              chargedWeightG: shipment.charged_weight_g,
              freightPaise: shipment.freight_paise,
              rtoFreightPaise: shipment.rto_freight_paise,
              pickupScheduledFor: shipment.pickup_scheduled_for,
              labelAvailable: shipment.label_key !== null,
              lastStatus: shipment.last_status_text,
              lastError: shipment.last_error,
              bookingAttempts: shipment.booking_attempts,
              trackingEvents: events.map((e) => ({
                statusText: e.status_text,
                location: e.location,
                at: e.event_time.toISOString(),
                source: e.source,
              })),
            }
          : null,
        notifications: notifications.map((n) => ({
          channel: n.channel,
          template: n.template,
          status: n.status,
          recipient: (n.recipient.startsWith('+') ? maskPhone(n.recipient) : n.recipient.slice(0, 8)) ?? '***',
          error: n.error,
          createdAt: n.created_at.toISOString(),
        })),
        notes: notes.map((n) => ({ text: n.text, by: n.by, at: n.at.toISOString() })),
        actions: {
          canCancel: canTransition(o.status, 'CANCELLED', 'ADMIN'),
          canRefund: captured && refundable > 0,
          canRetryShipment: o.status === 'CONFIRMED' && o.payment_status === 'PAID' && !shipment?.awb_code,
          canResolveIssue: o.ops_issue !== null,
        },
      };
    },

    /** POST /admin/orders/:code/refunds (Idempotency-Key) — full / partial, audited, job after commit. */
    async refund(orderCode: string, body: AdminRefundRequest, requestKey: string, by: AdminActor) {
      const result = await db.transaction(async (client) => {
        const o = await orderStore.findByCode(client, orderCode, 'update');
        if (!o) throw NOT_FOUND();
        const r = await requestAdminRefund(client, {
          orderId: o.id,
          paymentStatus: o.payment_status,
          amountPaise: body.amountPaise,
          reason: body.reason,
          notes: body.notes,
          adminId: by.auth.userId,
          requestKey,
        });
        if (r.created) {
          await audit(client, {
            actorId: by.auth.userId,
            action: 'ORDER_REFUND',
            entityType: 'order',
            entityId: o.id,
            before: { paymentStatus: o.payment_status },
            after: { refundId: r.refundId, amountPaise: body.amountPaise, reason: body.reason },
            ip: by.ip,
          });
        }
        return r;
      });
      if (result.created) {
        await enqueue(
          () => jobs.add('INITIATE_REFUND', { refundId: result.refundId }, jobIds.refund(result.refundId)),
          'refund',
        );
      }
      return {
        ok: true as const,
        message: result.created ? 'Refund initiated.' : 'Refund already requested.',
        refundId: result.refundId,
      };
    },

    async resendNotification(orderCode: string, template: string, by: AdminActor) {
      const o = await orderOr404(orderCode);
      await audit(db, {
        actorId: by.auth.userId,
        action: 'NOTIFICATION_RESEND',
        entityType: 'order',
        entityId: o.id,
        after: { template },
        ip: by.ip,
      });
      // Its own job id each time: an explicit resend bypasses the dedup on purpose
      await jobs.add(
        'NOTIFY_RESEND',
        { orderId: o.id, template },
        jobIds.notify(`resend-${template}`, `${o.id}-${Date.now()}`),
      );
      return { ok: true as const, message: 'Message queued.' };
    },

    async retryShipment(orderCode: string, by: AdminActor) {
      const o = await orderOr404(orderCode);
      if (o.status !== 'CONFIRMED' || o.payment_status !== 'PAID') {
        throw new AppError('INVALID_STATE', 'Only a paid order still waiting for its AWB can be retried.', {
          status: o.status,
        });
      }
      await audit(db, {
        actorId: by.auth.userId,
        action: 'SHIPMENT_RETRY',
        entityType: 'order',
        entityId: o.id,
        ip: by.ip,
      });
      // New job id: the dead-lettered `ship-<id>` job stays for the record; booking is idempotent
      await jobs.add('SHIPROCKET_CREATE_ORDER', { orderId: o.id }, `${jobIds.ship(o.id)}-retry-${Date.now()}`);
      return { ok: true as const, message: 'Booking retry queued.' };
    },

    async resolveIssue(orderCode: string, note: string, by: AdminActor) {
      return db.transaction(async (client) => {
        const o = await orderStore.findByCode(client, orderCode, 'update');
        if (!o) throw NOT_FOUND();
        if (!o.ops_issue) throw new AppError('INVALID_STATE', 'This order has no open issue.');
        const before = await orderStore.clearOpsIssue(client, o.id);
        await audit(client, {
          actorId: by.auth.userId,
          action: 'ORDER_ISSUE_RESOLVED',
          entityType: 'order',
          entityId: o.id,
          before: { opsIssue: before },
          after: { opsIssue: null, note },
          ip: by.ip,
        });
        return { ok: true as const, message: 'Issue resolved.' };
      });
    },

    async addNote(orderCode: string, text: string, by: AdminActor) {
      const o = await orderOr404(orderCode);
      await audit(db, {
        actorId: by.auth.userId,
        action: 'ORDER_NOTE',
        entityType: 'order',
        entityId: o.id,
        after: { text },
        ip: by.ip,
      });
      return { ok: true as const, message: 'Note added.' };
    },

    // ── §9.5 Customers ───────────────────────────────────────────────────────────────────────
    async customers(p: {
      q?: string;
      page: number;
      pageSize: number;
      sort: 'last_order_desc' | 'ltv_desc' | 'orders_desc';
    }) {
      const rows = await repo.listCustomers(db, p);
      return {
        customers: rows.map((r) => ({
          phone: r.phone,
          userId: r.user_id,
          name: r.name,
          ordersCount: r.orders_count,
          lifetimeValuePaise: r.ltv,
          lastOrderAt: r.last_order_at.toISOString(),
          rtoCount: r.rto_count,
          risk: r.rto_count > 0,
        })),
        page: p.page,
        pageSize: p.pageSize,
        total: rows[0]?.total ?? 0,
      };
    },

    async customer(phone: string): Promise<AdminCustomerDetail> {
      const [row] = await repo.listCustomers(db, { phone, page: 1, pageSize: 1, sort: 'last_order_desc' });
      if (!row) throw new AppError('NOT_FOUND', 'Customer not found.');
      const [orders, addresses] = await Promise.all([
        repo.listOrdersForCustomer(db, phone),
        row.user_id ? repo.listCustomerAddresses(db, row.user_id) : Promise.resolve([]),
      ]);
      return {
        customer: {
          phone: row.phone,
          userId: row.user_id,
          name: row.name,
          email: row.email,
          ordersCount: row.orders_count,
          lifetimeValuePaise: row.ltv,
          lastOrderAt: row.last_order_at.toISOString(),
          rtoCount: row.rto_count,
          risk: row.rto_count > 0,
        },
        orders: orders.map(toRow),
        addresses: addresses.map((a) => ({
          id: a.id,
          line1: a.line1,
          city: a.city,
          state: a.state,
          pincode: a.pincode,
          isDefault: a.is_default,
        })),
      };
    },

    // ── §9.6 Inventory expiry alerts ─────────────────────────────────────────────────────────
    async expiryAlerts(days = 14): Promise<ExpiryAlertsResponse> {
      const rows = await repo.listExpiryAlerts(db, await sellableBufferDays(), days);
      return {
        batches: rows.map((r) => ({
          batchId: r.batch_id,
          batchCode: r.batch_code,
          productTitle: r.product_title,
          kitchenCode: r.kitchen_code,
          availableStock: r.available_stock,
          expiryDate: r.expiry_date,
          sellableUntil: r.sellable_until,
          daysLeft: r.days_left,
        })),
      };
    },

    // ── §9.11 Ops ────────────────────────────────────────────────────────────────────────────
    async auditLog(p: { action?: string; entityType?: string; entityId?: string; page: number; pageSize: number }) {
      const rows = await repo.listAuditLog(db, p);
      return {
        entries: rows.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entity_type,
          entityId: r.entity_id,
          actor: r.actor_id ? { id: r.actor_id, email: r.actor_email } : null,
          before: r.before,
          after: r.after,
          ip: r.ip,
          createdAt: r.created_at.toISOString(),
        })),
        page: p.page,
        pageSize: p.pageSize,
        total: rows[0]?.total ?? 0,
      };
    },

    async webhookFailures() {
      const rows = await repo.listWebhookFailures(db);
      return {
        events: rows.map((r) => ({
          id: r.id,
          provider: r.provider,
          eventType: r.event_type,
          receivedAt: r.received_at.toISOString(),
          attempts: r.attempts,
          lastError: r.last_error,
          processed: r.processed_at !== null,
        })),
      };
    },

    async replayWebhook(id: number, by: AdminActor) {
      const ev = await repo.findWebhookEvent(db, id);
      if (!ev) throw new AppError('NOT_FOUND', 'Webhook event not found.');
      const result = await webhooks.replay(ev);
      await audit(db, {
        actorId: by.auth.userId,
        action: 'WEBHOOK_REPLAY',
        entityType: 'webhook_event',
        entityId: String(id),
        after: { provider: ev.provider, eventType: ev.event_type, result: result.status },
        ip: by.ip,
      });
      return result;
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
