import type { Page, Route } from '@playwright/test';

/**
 * page.route mocks for the Phase 8 tracking + My orders endpoints (contract:
 * packages/shared/src/contracts/tracking.ts). Every other API call falls through to the real backend.
 */
export const CODE = 'PK-7KQ2M9';
export const PHONE_DIGITS = '9876543210';

const cors = (route: Route) => ({
  'access-control-allow-origin': route.request().headers()['origin'] ?? 'http://localhost:3000',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST',
});

export const ok = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: cors(route),
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data,
      error: null,
      requestId: 'req_e2e',
      timestamp: new Date().toISOString(),
    }),
  });

export const fail = (route: Route, status: number, code: string, message: string, details?: Record<string, unknown>) =>
  route.fulfill({
    status,
    headers: cors(route),
    contentType: 'application/json',
    body: JSON.stringify({
      success: false,
      data: null,
      error: { code, message, ...(details ? { details } : {}) },
      requestId: 'req_e2e',
      timestamp: new Date().toISOString(),
    }),
  });

const preflight = (route: Route) => route.fulfill({ status: 204, headers: cors(route) });

type Tone = 'success' | 'info' | 'warning' | 'destructive' | 'neutral';
const step = (key: string, label: string, at: string, tone: Tone, detail: string | null = null) => ({
  key,
  label,
  at,
  detail,
  tone,
});

const items = [
  {
    title: 'Himachali Chicken Pickle',
    netWeightG: 250,
    quantity: 2,
    batchCode: 'PK-2610-CHK250-01',
    manufacturedAt: '2026-10-04',
  },
  {
    title: 'Pahadi Mutton Pickle',
    netWeightG: 500,
    quantity: 1,
    batchCode: 'PK-2610-MTN500-02',
    manufacturedAt: '2026-10-05',
  },
];

const journeyStart = [
  step('BOTTLED', 'Bottled in Himachal', '2026-10-04T00:00:00.000Z', 'success', 'PK-2610-CHK250-01'),
  step('CONFIRMED', 'Order confirmed', '2026-10-08T04:30:00.000Z', 'success'),
  step('PACKED', 'Airtight packed & sealed', '2026-10-09T05:12:00.000Z', 'success'),
  step('HANDED_TO_COURIER', 'Handed to courier', '2026-10-09T10:45:00.000Z', 'info', 'Bhuntar'),
  step('IN_TRANSIT', 'In transit', '2026-10-10T03:20:00.000Z', 'info', 'Chandigarh hub'),
  step('IN_TRANSIT', 'In transit', '2026-10-10T13:48:00.000Z', 'info', 'Delhi hub'),
];

const base = {
  orderCode: CODE,
  customerFirstName: 'Asha',
  destinationCity: 'Chennai',
  status: 'IN_TRANSIT',
  paymentStatus: 'PAID',
  items,
  courier: {
    name: 'Delhivery',
    awb: '1490810293847',
    trackingUrl: 'https://www.delhivery.com/track/package/1490810293847',
  },
  etd: '2026-10-14',
  timeline: journeyStart,
  refund: null,
  updatedAt: '2026-10-10T13:50:00.000Z',
};

export const TRACK_STATES = {
  'in-transit': base,
  delivered: {
    ...base,
    status: 'DELIVERED',
    timeline: [
      ...journeyStart,
      step('OUT_FOR_DELIVERY', 'Out for delivery', '2026-10-13T03:40:00.000Z', 'info', 'Chennai'),
      step('DELIVERED', 'Delivered', '2026-10-13T08:05:00.000Z', 'success'),
    ],
    updatedAt: '2026-10-13T08:06:00.000Z',
  },
  'delivery-failed': {
    ...base,
    status: 'DELIVERY_FAILED',
    timeline: [
      ...journeyStart,
      step('OUT_FOR_DELIVERY', 'Out for delivery', '2026-10-13T03:40:00.000Z', 'info', 'Chennai'),
      step(
        'DELIVERY_FAILED',
        'Delivery attempt failed',
        '2026-10-13T11:15:00.000Z',
        'warning',
        'Customer not reachable',
      ),
    ],
  },
  'cancelled-refund': {
    ...base,
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    courier: null,
    etd: null,
    timeline: [
      journeyStart[0],
      journeyStart[1],
      step('CANCELLED', 'Order cancelled', '2026-10-08T06:00:00.000Z', 'destructive', 'Cancelled at your request'),
      step('REFUND', 'Refund processed', '2026-10-09T09:30:00.000Z', 'info', 'Processed'),
    ],
    refund: { status: 'PROCESSED', amountPaise: 169700 },
  },
} as const;
export type TrackState = keyof typeof TRACK_STATES;

/** POST /track: right code + phone → the chosen state; anything else → the same generic 404. */
export async function mockTrack(page: Page, opts: { state?: TrackState; rateLimited?: boolean } = {}) {
  const calls: { orderCode: string; phone: string }[] = [];
  await page.route('**/api/v1/track', async (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const body = route.request().postDataJSON() as { orderCode: string; phone: string };
    calls.push(body);
    if (opts.rateLimited) return fail(route, 429, 'RATE_LIMITED', 'Too many requests', { retryAfterSeconds: 420 });
    const phone = body.phone.replace(/\D/g, '').slice(-10);
    if (body.orderCode !== CODE || phone !== PHONE_DIGITS) return fail(route, 404, 'NOT_FOUND', 'Order not found');
    return ok(route, TRACK_STATES[opts.state ?? 'in-transit']);
  });
  return calls;
}

export const sessionUser = {
  id: '0b7f8a62-3c1d-4f5e-9a2b-8c7d6e5f4a3b',
  role: 'CUSTOMER',
  fullName: null,
  phoneMasked: '+91******3210',
  email: null,
  totpEnabled: false,
};

const summaries = [
  {
    orderCode: CODE,
    status: 'IN_TRANSIT',
    paymentStatus: 'PAID',
    totalPaise: 169700,
    itemCount: 2,
    firstItemTitle: 'Himachali Chicken Pickle',
    createdAt: '2026-10-08T04:25:00.000Z',
  },
  {
    orderCode: 'PK-3BX9QA',
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    totalPaise: 44900,
    itemCount: 1,
    firstItemTitle: 'Pahadi Mutton Pickle',
    createdAt: '2026-09-21T11:02:00.000Z',
  },
  {
    orderCode: 'PK-9MZ4TR',
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    totalPaise: 79900,
    itemCount: 1,
    firstItemTitle: 'Kangra Fish Pickle',
    createdAt: '2026-09-02T07:40:00.000Z',
  },
];

/** /auth/* + /me/orders. `total` > orders.length exercises pagination. */
export async function mockAccount(
  page: Page,
  opts: { signedIn: boolean; empty?: boolean; total?: number; canCancel?: boolean },
) {
  const state = { signedIn: opts.signedIn };
  await page.route(/\/api\/v1\/(auth|me)\//, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return preflight(route);
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me')
      return state.signedIn
        ? ok(route, { user: sessionUser, pickupLocationIds: [] })
        : fail(route, 401, 'UNAUTHENTICATED', 'Please sign in.');
    if (path === '/auth/refresh') return fail(route, 401, 'UNAUTHENTICATED', 'Please sign in.');
    if (!state.signedIn) return fail(route, 401, 'UNAUTHENTICATED', 'Please sign in.');
    if (path === '/me/orders') {
      const pageNo = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
      const orders = opts.empty ? [] : pageNo === 1 ? summaries : summaries.slice(0, 1);
      return ok(route, { orders, page: pageNo, pageSize, total: opts.empty ? 0 : (opts.total ?? summaries.length) });
    }
    if (path === `/me/orders/${CODE}`)
      return ok(route, {
        ...TRACK_STATES['in-transit'],
        totalPaise: 169700,
        subtotalPaise: 169700,
        shippingFeePaise: 0,
        invoiceAvailable: true,
        canCancel: opts.canCancel ?? false,
        createdAt: '2026-10-08T04:25:00.000Z',
      });
    return fail(route, 404, 'NOT_FOUND', 'Not found');
  });
  return state;
}
