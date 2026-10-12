import {
  MarkPackedHeadersSchema,
  MarkPackedRequestSchema,
  PartnerManifestsResponseSchema,
  PartnerOrderCardSchema,
  PartnerOrdersResponseSchema,
  PushConfigResponseSchema,
  PushSubscriptionRequestSchema,
  SignedUrlResponseSchema,
  type PartnerOrderCard,
} from '@pk/shared';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { API, mockCatalogApi } from './catalog-api';

/**
 * Stateful mock of the Phase 7 partner API (/partner/*) on top of the catalog mock (auth + batches).
 * Every fixture and response goes through the @pk/shared Zod contracts, so contract drift fails the spec.
 */
export const LABELS = 'https://labels.pahadikhatki.test';
const ORIGIN = 'http://localhost:5173';
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
};
const envelope = (success: boolean, data: unknown, error: unknown = null) => ({
  success,
  data,
  error,
  requestId: 'req_desk',
  timestamp: new Date().toISOString(),
});
const reply = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
const ok = (route: Route, data: unknown, status = 200) => reply(route, status, envelope(true, data));
const fail = (route: Route, status: number, code: string, message: string, details?: Record<string, unknown>) =>
  reply(route, status, envelope(false, null, { code, message, ...(details ? { details } : {}) }));

/** Next 11:00 IST cut-off after `from` (good enough for fixtures). */
function nextCutoff(from = Date.now()): string {
  const d = new Date(from);
  const cut = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 5, 30); // 11:00 IST
  return new Date(cut > from ? cut : cut + 86_400_000).toISOString();
}

const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function card(p: Partial<PartnerOrderCard> & Pick<PartnerOrderCard, 'orderCode'>): PartnerOrderCard {
  return PartnerOrderCardSchema.parse({
    status: 'AWAITING_PACKING',
    items: [
      {
        title: 'Himachali Chicken Pickle',
        sku: 'CHK250',
        netWeightG: 250,
        quantity: 1,
        batches: [{ batchCode: 'PK-2610-CHK250-01', quantity: 1 }],
      },
    ],
    customerFirstName: 'Arun',
    city: 'Chennai',
    state: 'Tamil Nadu',
    courierName: 'Delhivery',
    awbCode: '1490811234567',
    labelReady: true,
    confirmedAt: ago(5),
    packBy: nextCutoff(),
    pickupDate: null,
    ...p,
  });
}

export function deskSeed() {
  return {
    AWAITING_PACKING: [
      card({
        orderCode: 'PK-7KQ2M9',
        confirmedAt: ago(26),
        packBy: ago(2), // missed this morning's cut-off → "late"
        items: [
          {
            title: 'Himachali Chicken Pickle',
            sku: 'CHK250',
            netWeightG: 250,
            quantity: 2,
            batches: [
              { batchCode: 'PK-2610-CHK250-01', quantity: 1 },
              { batchCode: 'PK-2610-CHK250-02', quantity: 1 },
            ],
          },
          {
            title: 'Pahadi Mutton Pickle',
            sku: 'MTN250',
            netWeightG: 250,
            quantity: 1,
            batches: [{ batchCode: 'PK-2609-MTN250-03', quantity: 1 }],
          },
        ],
      }),
      card({ orderCode: 'PK-6AB19C', customerFirstName: 'Meera', city: 'Bengaluru', state: 'Karnataka' }),
      card({
        orderCode: 'PK-5MM8T2',
        customerFirstName: 'Vikram',
        city: 'New Delhi',
        state: 'Delhi',
        labelReady: false,
        courierName: null,
        awbCode: null,
        confirmedAt: ago(1),
      }),
    ],
    PACKED: [card({ orderCode: 'PK-4HD2RX', status: 'PACKED', pickupDate: today(), customerFirstName: 'Neha' })],
    PICKUP_SCHEDULED: [
      card({ orderCode: 'PK-3QW8ZP', status: 'PICKUP_SCHEDULED', pickupDate: today(), customerFirstName: 'Kabir' }),
    ],
  } satisfies Record<string, PartnerOrderCard[]>;
}

export interface DeskMockOptions {
  /** Orders the server will refuse with 409 ORDER_CANCELLED. */
  cancelled?: string[];
  vapidPublicKey?: string | null;
  emptyQueue?: boolean;
  hangOrders?: boolean;
}

export interface MarkPackedCall {
  orderCode: string;
  key: string;
  status: number;
}

/** Partner session + catalog/batches mock + /partner/* mock + signed-PDF host. */
export async function mockDeskApi(page: Page, context: BrowserContext, opts: DeskMockOptions = {}) {
  const catalog = await mockCatalogApi(page, { role: 'KITCHEN_PARTNER' });
  const orders = deskSeed();
  if (opts.emptyQueue) orders.AWAITING_PACKING = [];
  const markPacked: MarkPackedCall[] = [];
  const labelRequests: string[] = [];
  const pushBodies: unknown[] = [];

  await context.route(`${LABELS}/**`, (route) => {
    labelRequests.push(route.request().url());
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/pdf',
      body: '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    });
  });

  const signed = (path: string) =>
    SignedUrlResponseSchema.parse({
      url: `${LABELS}/${path}?sig=e2e`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });

  await page.route(`${API}/partner/**`, async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');

    if (path === '/partner/pickup-locations') return route.fallback(); // catalog mock

    if (path === '/partner/orders' && method === 'GET') {
      if (opts.hangOrders) return; // never answers → skeleton
      const status = (url.searchParams.get('status') ?? 'AWAITING_PACKING') as keyof typeof orders;
      const list = [...orders[status]].sort((a, b) => (a.confirmedAt ?? '').localeCompare(b.confirmedAt ?? ''));
      return ok(
        route,
        PartnerOrdersResponseSchema.parse({ orders: list, toPack: orders.AWAITING_PACKING.length, cutoffHourIst: 11 }),
      );
    }

    const pack = /^\/partner\/orders\/(PK-[0-9A-Z]{6})\/mark-packed$/.exec(path);
    if (pack && method === 'POST') {
      const code = pack[1]!;
      const headers = MarkPackedHeadersSchema.safeParse({ 'idempotency-key': req.headers()['idempotency-key'] });
      const body = MarkPackedRequestSchema.safeParse(req.postDataJSON());
      const key = req.headers()['idempotency-key'] ?? '';
      const record = (status: number) => markPacked.push({ orderCode: code, key, status });
      if (!headers.success || !body.success) {
        record(400);
        return fail(route, 400, 'VALIDATION_ERROR', 'Invalid mark-packed request');
      }
      if (opts.cancelled?.includes(code)) {
        orders.AWAITING_PACKING = orders.AWAITING_PACKING.filter((o) => o.orderCode !== code);
        record(409);
        return fail(route, 409, 'INVALID_STATE', 'This order was cancelled — do not pack it.', {
          reason: 'ORDER_CANCELLED',
          status: 'CANCELLED',
        });
      }
      const awaiting = orders.AWAITING_PACKING.find((o) => o.orderCode === code);
      const packed = orders.PACKED.find((o) => o.orderCode === code);
      if (!awaiting && !packed) {
        record(404);
        return fail(route, 404, 'NOT_FOUND', 'Order not found');
      }
      if (awaiting) {
        orders.AWAITING_PACKING = orders.AWAITING_PACKING.filter((o) => o.orderCode !== code);
        orders.PACKED.push({ ...awaiting, status: 'PACKED', pickupDate: today() });
      }
      record(200);
      return ok(route, { orderCode: code, status: 'PACKED', changed: Boolean(awaiting), pickupDate: today() });
    }

    const label = /^\/partner\/orders\/(PK-[0-9A-Z]{6})\/label$/.exec(path);
    if (label) {
      const all = [...orders.AWAITING_PACKING, ...orders.PACKED, ...orders.PICKUP_SCHEDULED];
      const o = all.find((x) => x.orderCode === label[1]);
      if (!o?.labelReady) return fail(route, 404, 'NOT_FOUND', 'Label not ready');
      return ok(route, signed(`label-${o.orderCode}.pdf`));
    }

    if (path === '/partner/labels/a4') {
      const codes = (url.searchParams.get('orders') ?? '').split(',').filter(Boolean);
      if (codes.length < 1 || codes.length > 20) return fail(route, 400, 'VALIDATION_ERROR', '1–20 orders');
      return ok(route, signed(`a4-${codes.join('_')}.pdf`));
    }

    if (path === '/partner/manifests')
      return ok(
        route,
        PartnerManifestsResponseSchema.parse({
          manifests: [
            {
              pickupDate: today(),
              kitchenCode: 'KULLU-01',
              orderCodes: ['PK-3QW8ZP'],
              ...signed(`manifest-${today()}.pdf`),
            },
          ],
        }),
      );

    if (path === '/partner/push-subscriptions') {
      if (method === 'GET')
        return ok(
          route,
          PushConfigResponseSchema.parse({ vapidPublicKey: opts.vapidPublicKey ?? null, subscribed: false }),
        );
      const body = req.postDataJSON() as unknown;
      pushBodies.push({ method, body });
      if (method === 'POST' && !PushSubscriptionRequestSchema.safeParse(body).success)
        return fail(route, 400, 'VALIDATION_ERROR', 'Invalid subscription');
      return ok(route, { ok: true }, method === 'POST' ? 201 : 200);
    }

    return fail(route, 404, 'NOT_FOUND', `No desk mock for ${method} ${path}`);
  });

  return { catalog, orders, markPacked, labelRequests, pushBodies };
}
