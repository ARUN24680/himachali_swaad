import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { PDFDocument, StandardFonts } from 'pdf-lib';

/**
 * Stateful stand-in for the Shiprocket API (dev + CI, D-53) — same paths and response shapes the
 * real client parses, so the production client code runs end-to-end without an account. Mounted
 * at /api/v1/dev/shiprocket/ when SHIPPING_PROVIDER=sandbox (refused in production) and on an
 * ephemeral port in integration tests. Supports fault injection (5xx / 429 / expired tokens).
 * In-memory: a dev API restart forgets sandbox shipments (tracking polls then 404 → logged).
 */
export interface SandboxShipment {
  shipmentId: string;
  orderId: string;
  channelOrderId: string;
  pickupLocation: string;
  deliveryPincode: string;
  weightKg: number;
  awb: string | null;
  courierId: number | null;
  pickupToken: string | null;
  cancelled: boolean;
  statusText: string;
  scans: { date: string; status: string; location: string; srStatus: number | null }[];
}

export interface ShiprocketSandbox {
  readonly shipments: Map<string, SandboxShipment>;
  /** Calls per endpoint (`orders/create`, `courier/assign`, …). */
  readonly calls: Map<string, number>;
  /** The next `times` calls to `endpoint` answer `status` (e.g. 503). */
  failNext(endpoint: string, status: number, times?: number): void;
  /** Invalidate every issued token — the next call gets 401 (token-expiry simulation). */
  expireTokens(): void;
  setWalletRupees(amount: number): void;
  /** Pincodes no courier serves (serviceability → 404). */
  readonly unserviceable: Set<string>;
  byAwb(awb: string): SandboxShipment | undefined;
  byChannelOrderId(orderCode: string): SandboxShipment | undefined;
  /** Courier scan: moves the shipment and returns the Shiprocket-style webhook body. */
  scan(awb: string, statusText: string, location?: string): Record<string, unknown>;
  reset(): void;
}

/** Shiprocket's numeric ids for the labels the sandbox emits (see @pk/shared shiprocket-status-map). */
const STATUS_IDS: Record<string, number> = {
  'PICKED UP': 42,
  SHIPPED: 6,
  'IN TRANSIT': 18,
  'OUT FOR DELIVERY': 17,
  DELIVERED: 7,
  UNDELIVERED: 21,
  'RTO INITIATED': 9,
  'RTO DELIVERED': 10,
  LOST: 12,
  'PICKUP EXCEPTION': 20,
  'OUT FOR PICKUP': 19,
};

export const COURIERS = [
  {
    courier_company_id: 10,
    courier_name: 'Sandbox Surface',
    rate: 62.5,
    rating: 4.4,
    estimated_delivery_days: '5',
    etd: '',
  },
  {
    courier_company_id: 11,
    courier_name: 'Sandbox Express',
    rate: 89,
    rating: 4.7,
    estimated_delivery_days: '3',
    etd: '',
  },
  {
    courier_company_id: 12,
    courier_name: 'Sandbox Budget',
    rate: 48,
    rating: 3.2,
    estimated_delivery_days: '8',
    etd: '',
  },
];

/** 'DD MM YYYY HH:mm:ss' in IST — the format Shiprocket's webhook `current_timestamp` uses. */
function istStamp(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(ist.getUTCDate())} ${p(ist.getUTCMonth() + 1)} ${ist.getUTCFullYear()} ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())}:${p(ist.getUTCSeconds())}`;
}
function istIso(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 19).replace('T', ' ');
}

async function labelPdf(s: SandboxShipment): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([288, 432]); // 4×6 in at 72 dpi (D-37)
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lines = [
    'SANDBOX LABEL — NOT FOR SHIPPING',
    `AWB ${s.awb}`,
    `Order ${s.channelOrderId}`,
    `To PIN ${s.deliveryPincode}`,
  ];
  lines.forEach((t, i) => page.drawText(t, { x: 18, y: 390 - i * 28, size: i === 1 ? 16 : 11, font }));
  return pdf.save();
}

export function createShiprocketSandbox(opts: { baseUrl: () => string; email?: string; password?: string }) {
  const shipments = new Map<string, SandboxShipment>();
  const calls = new Map<string, number>();
  const faults = new Map<string, { status: number; times: number }>();
  const tokens = new Set<string>();
  const documents = new Map<string, Uint8Array>();
  const unserviceable = new Set<string>();
  let wallet = 5000;
  let seq = 1000;

  const state: ShiprocketSandbox = {
    shipments,
    calls,
    unserviceable,
    failNext(endpoint, status, times = 1) {
      faults.set(endpoint, { status, times });
    },
    expireTokens: () => tokens.clear(),
    setWalletRupees(amount) {
      wallet = amount;
    },
    byAwb: (awb) => [...shipments.values()].find((s) => s.awb === awb),
    byChannelOrderId: (code) => [...shipments.values()].find((s) => s.channelOrderId === code),
    scan(awb, statusText, location = 'Sandbox Hub') {
      const s = state.byAwb(awb);
      if (!s) throw new Error(`sandbox: unknown AWB ${awb}`);
      const now = new Date();
      const id = STATUS_IDS[statusText.toUpperCase()] ?? null;
      s.statusText = statusText.toUpperCase();
      s.scans.push({ date: istIso(now), status: s.statusText, location, srStatus: id });
      return {
        awb,
        courier_name: COURIERS.find((c) => c.courier_company_id === s.courierId)?.courier_name ?? 'Sandbox',
        current_status: s.statusText,
        current_status_id: id,
        shipment_status: s.statusText,
        shipment_status_id: id,
        current_timestamp: istStamp(now),
        order_id: s.channelOrderId,
        sr_order_id: Number(s.orderId),
        etd: istIso(new Date(now.getTime() + 3 * 86_400_000)),
        scans: s.scans.map((x) => ({
          date: x.date,
          status: x.status,
          activity: x.status,
          location: x.location,
          'sr-status': x.srStatus ?? '',
          'sr-status-label': x.status,
        })),
        is_return: 0,
      };
    },
    reset() {
      shipments.clear();
      calls.clear();
      faults.clear();
      tokens.clear();
      documents.clear();
      unserviceable.clear();
      wallet = 5000;
    },
  };

  // Server-to-server (worker → API in dev); the API's per-IP limit would throttle the worker
  const NO_RATE_LIMIT = { config: { rateLimit: false } } as const;
  const plugin: FastifyPluginAsync = async (app) => {
    app.addHook('onRequest', async (req, reply) => {
      const path = req.url.split('?')[0]!.replace(/^.*?\/(?=(auth|courier|orders|manifests|account|files)\/)/, '');
      const endpoint = path.split('/').slice(0, 2).join('/');
      calls.set(endpoint, (calls.get(endpoint) ?? 0) + 1);
      const fault = faults.get(endpoint);
      if (fault && fault.times > 0) {
        fault.times -= 1;
        return reply.code(fault.status).send({ message: `sandbox injected ${fault.status}` });
      }
      if (endpoint === 'auth/login' || endpoint.startsWith('files/')) return;
      const auth = req.headers.authorization?.replace(/^Bearer /, '');
      if (!auth || !tokens.has(auth)) return reply.code(401).send({ message: 'Token has expired', status_code: 401 });
    });

    app.post('/auth/login', NO_RATE_LIMIT, async (req, reply) => {
      const b = req.body as { email?: string; password?: string };
      if ((opts.email && b.email !== opts.email) || (opts.password && b.password !== opts.password)) {
        return reply.code(400).send({ message: 'Invalid email and password combination' });
      }
      const token = randomBytes(24).toString('hex');
      tokens.add(token);
      return { token, first_name: 'API', last_name: 'User' };
    });

    app.get('/courier/serviceability/', NO_RATE_LIMIT, async (req, reply) => {
      const q = req.query as Record<string, string>;
      if (unserviceable.has(q.delivery_postcode ?? '')) {
        return reply.code(404).send({ status: 404, message: 'No courier serviceable for this pincode' });
      }
      return { status: 200, data: { available_courier_companies: COURIERS } };
    });

    app.post('/orders/create/adhoc', NO_RATE_LIMIT, async (req, reply) => {
      const b = req.body as { order_id?: string; pickup_location?: string; billing_pincode?: string; weight?: number };
      if (!b.order_id || !b.pickup_location || !b.billing_pincode) {
        return reply.code(422).send({ message: 'The order id, pickup location and pincode fields are required.' });
      }
      seq += 1;
      const s: SandboxShipment = {
        shipmentId: String(seq + 500_000),
        orderId: String(seq),
        channelOrderId: b.order_id,
        pickupLocation: b.pickup_location,
        deliveryPincode: b.billing_pincode,
        weightKg: Number(b.weight ?? 0.5),
        awb: null,
        courierId: null,
        pickupToken: null,
        cancelled: false,
        statusText: 'NEW',
        scans: [],
      };
      shipments.set(s.shipmentId, s);
      return { order_id: Number(s.orderId), shipment_id: Number(s.shipmentId), status: 'NEW', status_code: 1 };
    });

    app.post('/courier/assign/awb', NO_RATE_LIMIT, async (req) => {
      const b = req.body as { shipment_id: string; courier_id: number };
      const s = shipments.get(String(b.shipment_id));
      if (!s) return { awb_assign_status: 0, message: 'Shipment not found' };
      if (wallet <= 0) return { awb_assign_status: 0, message: 'Insufficient wallet balance' };
      s.awb ??= `SBX${s.shipmentId}${String(b.courier_id).padStart(2, '0')}`;
      s.courierId = Number(b.courier_id);
      s.statusText = 'AWB ASSIGNED';
      const c = COURIERS.find((x) => x.courier_company_id === s.courierId);
      wallet -= c?.rate ?? 0;
      return {
        awb_assign_status: 1,
        response: { data: { awb_code: s.awb, courier_company_id: s.courierId, courier_name: c?.courier_name } },
      };
    });

    app.post('/courier/generate/label', NO_RATE_LIMIT, async (req) => {
      const ids = (req.body as { shipment_id: string[] }).shipment_id.map(String);
      const s = shipments.get(ids[0]!);
      if (!s?.awb) return { label_created: 0, not_created: ids };
      const key = `label-${s.shipmentId}.pdf`;
      documents.set(key, await labelPdf(s));
      return { label_created: 1, label_url: `${opts.baseUrl()}files/${key}`, not_created: [] };
    });

    app.post('/courier/generate/pickup', NO_RATE_LIMIT, async (req) => {
      const b = req.body as { shipment_id: string[]; pickup_date?: string[] };
      const token = `PT${randomBytes(4).toString('hex').toUpperCase()}`;
      for (const id of b.shipment_id.map(String)) {
        const s = shipments.get(id);
        if (s) {
          s.pickupToken = token;
          s.statusText = 'PICKUP SCHEDULED';
        }
      }
      return {
        pickup_status: 1,
        response: {
          pickup_scheduled_date: `${b.pickup_date?.[0] ?? ''} 10:00:00`,
          pickup_token_number: token,
          status: 3,
        },
      };
    });

    app.post('/manifests/generate', NO_RATE_LIMIT, async (req) => {
      const ids = (req.body as { shipment_id: string[] }).shipment_id.map(String);
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(`SANDBOX MANIFEST — ${ids.length} shipment(s)`, { x: 40, y: 790, size: 14, font });
      const key = `manifest-${randomBytes(4).toString('hex')}.pdf`;
      documents.set(key, await pdf.save());
      return { status: 1, manifest_url: `${opts.baseUrl()}files/${key}` };
    });

    app.post('/orders/cancel/shipment/awbs', NO_RATE_LIMIT, async (req) => {
      for (const awb of (req.body as { awbs: string[] }).awbs) {
        const s = state.byAwb(awb);
        if (s) s.cancelled = true;
      }
      return { message: 'Bulk Shipment cancellation is in progress. Please wait for 24 hours.' };
    });

    app.post('/orders/cancel', NO_RATE_LIMIT, async (req) => {
      for (const id of (req.body as { ids: number[] }).ids) {
        for (const s of shipments.values()) if (s.orderId === String(id)) s.cancelled = true;
      }
      return { status: 200 };
    });

    app.get('/courier/track/awb/:awb', NO_RATE_LIMIT, async (req, reply) => {
      const s = state.byAwb((req.params as { awb: string }).awb);
      if (!s) return reply.code(404).send({ message: 'AWB not found' });
      return {
        tracking_data: {
          track_status: 1,
          shipment_status: STATUS_IDS[s.statusText] ?? 0,
          shipment_track: [{ current_status: s.statusText, weight: String(s.weightKg), edd: null }],
          shipment_track_activities: [...s.scans].reverse().map((x) => ({
            date: x.date,
            status: x.status,
            activity: x.status,
            location: x.location,
            'sr-status': x.srStatus ?? '',
            'sr-status-label': x.status,
          })),
          etd: null,
        },
      };
    });

    app.get('/account/details/wallet-balance', NO_RATE_LIMIT, async () => ({
      data: { balance_amount: wallet.toFixed(2) },
    }));

    app.get('/files/:key', NO_RATE_LIMIT, async (req, reply) => {
      const doc = documents.get((req.params as { key: string }).key);
      if (!doc) return reply.code(404).send({ message: 'not found' });
      return reply.type('application/pdf').send(Buffer.from(doc));
    });
  };

  return { state, plugin };
}
