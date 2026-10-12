/* global __ENV */
// Phase 10 §10.2 — checkout spike on a small-stock product + read-path latency.
// Run against an isolated stack (load/README.md): API with TRUST_PROXY=true, mock payments.
//   k6 run -e API=http://host.docker.internal:4200 -e PRODUCT_ID=<uuid> load/k6/checkout-spike.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:4200';
const PRODUCT_ID = __ENV.PRODUCT_ID;
const ORIGIN = __ENV.ORIGIN || 'http://localhost:3000';

const reserved = new Counter('orders_reserved');
const soldOut = new Counter('orders_sold_out');
const confirmed = new Counter('orders_confirmed');
const unexpected = new Counter('unexpected_status');
const createLatency = new Trend('create_order_ms', true);

export const options = {
  scenarios: {
    // 50 shoppers hit "Pay" for a 20-jar product at the same moment
    spike: { executor: 'per-vu-iterations', vus: 50, iterations: 1, maxDuration: '60s', exec: 'buy' },
    // Steady browsing + tracking + admin list while the spike runs
    reads: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 20,
      exec: 'read',
    },
  },
  thresholds: {
    'http_req_duration{kind:read}': ['p(95)<200'],
    unexpected_status: ['count==0'],
  },
};

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
// Distinct client IPs (TRUST_PROXY) so per-IP limits behave like real, separate customers
const ip = () => `10.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}.${(Math.random() * 250) | 0}`;
const phone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const headers = (extra = {}) => ({
  'content-type': 'application/json',
  origin: ORIGIN,
  'x-forwarded-for': ip(),
  ...extra,
});

export function buy() {
  const body = {
    items: [{ productId: PRODUCT_ID, quantity: 1 }],
    customer: { fullName: 'Load Tester', phone: phone() },
    shippingAddress: { line1: '12 Mall Road', city: 'Kullu', state: 'Himachal Pradesh', pincode: '175101' },
    consent: { orderUpdates: true, whatsappOptIn: false },
  };
  const res = http.post(`${API}/api/v1/checkout/create-order`, JSON.stringify(body), {
    headers: headers({ 'idempotency-key': uuid() }),
    tags: { kind: 'checkout' },
  });
  createLatency.add(res.timings.duration);
  if (res.status === 409) {
    soldOut.add(1);
    return;
  }
  if (res.status !== 200 && res.status !== 201) {
    unexpected.add(1);
    console.error(`create-order ${res.status} ${res.body}`);
    return;
  }
  reserved.add(1);
  const co = res.json('data');
  const sim = http.post(
    `${API}/api/v1/dev/payments/simulate`,
    JSON.stringify({ razorpayOrderId: co.razorpayOrderId, outcome: 'success', sendWebhook: false }),
    { headers: headers(), tags: { kind: 'checkout' } },
  );
  const verify = http.post(`${API}/api/v1/payments/verify`, JSON.stringify(sim.json('data')), {
    headers: headers(),
    tags: { kind: 'checkout' },
  });
  if (check(verify, { 'verify 200': (r) => r.status === 200 })) confirmed.add(1);
  else unexpected.add(1);
}

export function setup() {
  // Admin session for the admin list read (dev: ADMIN_TOTP_REQUIRED off on the load stack)
  const login = http.post(
    `${API}/api/v1/auth/staff/login`,
    JSON.stringify({ email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD }),
    { headers: headers() },
  );
  const jar = http.cookieJar();
  const cookies = jar.cookiesForURL(`${API}/`);
  return { at: (cookies.pk_at || [])[0] || null, loginStatus: login.status };
}

export function read(data) {
  const r = Math.random();
  if (r < 0.5) {
    const res = http.get(`${API}/api/v1/products`, { headers: headers(), tags: { kind: 'read', name: 'products' } });
    if (res.status !== 200) unexpected.add(1);
  } else if (r < 0.8) {
    // Unknown code → generic 404 is the normal "wrong details" path (no enumeration)
    const res = http.post(
      `${API}/api/v1/track`,
      JSON.stringify({
        orderCode: `PK-${'ABCDEFGHJK'[(Math.random() * 10) | 0]}${String((Math.random() * 1e5) | 0)
          .padStart(5, '7')
          .replace(/[01]/g, '7')}`,
        phone: '9876543210',
      }),
      { headers: headers(), tags: { kind: 'read', name: 'track' } },
    );
    if (res.status !== 404 && res.status !== 200) unexpected.add(1);
  } else if (data.at) {
    const res = http.get(`${API}/api/v1/admin/orders?pageSize=25`, {
      headers: headers({ cookie: `pk_at=${data.at}` }),
      tags: { kind: 'read', name: 'admin_orders' },
    });
    if (res.status !== 200) unexpected.add(1);
  }
}
