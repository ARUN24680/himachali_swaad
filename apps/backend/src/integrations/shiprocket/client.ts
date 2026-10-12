import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { ErrorReporter } from '../../config/sentry';
import { withTimeout } from '../../utils/with-timeout';

/**
 * Shiprocket REST client (Phase 6 §6.2) — https://apiv2.shiprocket.in/v1/external/. Paths and
 * payload fields follow Shiprocket's public API docs ("Shiprocket API" Postman collection, linked
 * from apidocs.shiprocket.in); every response is Zod-parsed so a changed shape fails loudly.
 * No SDK. Never logs request/response bodies (customer address + phone = PII).
 */

export const SHIPROCKET_API = 'https://apiv2.shiprocket.in/v1/external/';
const TIMEOUT_MS = 10_000;
/** Login tokens are valid 10 days (240 h); refresh a day early. */
const TOKEN_TTL_SEC = 9 * 24 * 3600;

/**
 * `retryable` = network error, timeout, 5xx or 429 → the job retries with backoff. Anything else
 * (4xx validation, business refusal) fails the job immediately (Phase 6 §6.1).
 */
export class ShiprocketError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ShiprocketError';
  }
}

// ── Response shapes (only the fields we use; extra fields pass through) ────────────────────────
const num = z.coerce.number();
const str = z.coerce.string();

const LoginResponse = z.looseObject({ token: z.string().min(10) });

const CourierCompany = z.looseObject({
  courier_company_id: num.pipe(z.number().int()),
  courier_name: z.string(),
  rate: num,
  rating: num.nullish(),
  estimated_delivery_days: num.nullish(),
  etd: z.string().nullish(),
});
const ServiceabilityResponse = z.looseObject({
  data: z.looseObject({ available_courier_companies: z.array(CourierCompany).default([]) }).nullish(),
});

const CreateOrderResponse = z.looseObject({ order_id: str, shipment_id: str });

const AssignAwbResponse = z.looseObject({
  awb_assign_status: num,
  message: z.string().nullish(),
  response: z
    .looseObject({
      data: z.looseObject({
        awb_code: str,
        courier_company_id: num.nullish(),
        courier_name: z.string().nullish(),
      }),
    })
    .nullish(),
});

const LabelResponse = z.looseObject({ label_created: num, label_url: z.string().nullish() });

const PickupResponse = z.looseObject({
  pickup_status: num,
  response: z
    .looseObject({
      pickup_scheduled_date: z.string().nullish(),
      pickup_token_number: z.string().nullish(),
    })
    .nullish(),
});

const ManifestResponse = z.looseObject({ manifest_url: z.string().nullish() });

const TrackActivity = z.looseObject({
  date: z.string(),
  status: z.string().nullish(),
  activity: z.string().nullish(),
  location: z.string().nullish(),
  'sr-status': z.union([z.string(), z.number()]).nullish(),
  'sr-status-label': z.string().nullish(),
});
const TrackResponse = z.looseObject({
  tracking_data: z.looseObject({
    track_status: num.nullish(),
    shipment_status: num.nullish(),
    shipment_track: z
      .array(
        z.looseObject({
          current_status: z.string().nullish(),
          weight: z.union([z.string(), z.number()]).nullish(),
          edd: z.string().nullish(),
        }),
      )
      .nullish(),
    shipment_track_activities: z.array(TrackActivity).nullish(),
    etd: z.string().nullish(),
  }),
});

const WalletResponse = z.looseObject({ data: z.looseObject({ balance_amount: num }) });

// ── Public contract ──────────────────────────────────────────────────────────────────────────────
export interface CourierOption {
  courierId: number;
  courierName: string;
  ratePaise: number;
  rating: number | null;
  etdDays: number | null;
  etd: string | null;
}

export interface ShiprocketOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_address_2: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: 'India';
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: true;
  order_items: { name: string; sku: string; units: number; selling_price: number; hsn: string }[];
  payment_method: 'Prepaid';
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
  invoice_number?: string;
}

export interface TrackingActivity {
  date: string;
  statusText: string;
  statusId: number | null;
  location: string | null;
}

export interface TrackResult {
  activities: TrackingActivity[];
  chargedWeightG: number | null;
  etd: string | null;
}

export interface ShiprocketApi {
  checkServiceability(p: {
    pickupPincode: string;
    deliveryPincode: string;
    weightKg: number;
  }): Promise<CourierOption[]>;
  createOrder(payload: ShiprocketOrderPayload): Promise<{ shiprocketOrderId: string; shipmentId: string }>;
  assignAwb(shipmentId: string, courierId: number): Promise<{ awb: string; courierName: string | null }>;
  generateLabel(shipmentIds: string[]): Promise<{ labelUrl: string }>;
  generatePickup(
    shipmentIds: string[],
    pickupDate: string,
  ): Promise<{ pickupToken: string | null; scheduledDate: string | null }>;
  generateManifest(shipmentIds: string[]): Promise<{ manifestUrl: string | null }>;
  cancelShipment(awbs: string[]): Promise<void>;
  cancelOrder(shiprocketOrderIds: string[]): Promise<void>;
  trackByAwb(awb: string): Promise<TrackResult>;
  getWalletBalancePaise(): Promise<number>;
  /** Downloads a label/manifest PDF from the URL Shiprocket returned. */
  downloadDocument(url: string): Promise<Uint8Array>;
}

/** Rupees (Shiprocket floats) → integer paise (D-26). */
export const rupeesToPaise = (rupees: number) => Math.round(rupees * 100);

export function createShiprocketClient(cfg: {
  baseUrl?: string;
  email: string;
  password: string;
  redis: Redis;
  logger: Logger;
  reporter?: ErrorReporter;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Redis key prefix for the token + its refresh lock (tests isolate per file). */
  keyPrefix?: string;
}): ShiprocketApi {
  const TOKEN_KEY = `${cfg.keyPrefix ?? 'pk:shiprocket'}:token`;
  const LOCK_KEY = `${cfg.keyPrefix ?? 'pk:shiprocket'}:token-lock`;
  const base = (cfg.baseUrl ?? SHIPROCKET_API).replace(/\/?$/, '/');
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS;
  const log = cfg.logger.child({ integration: 'shiprocket' });

  /** One HTTP call; never retries itself (BullMQ owns retries). */
  async function http(
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; token?: string; query?: Record<string, string> } = {},
  ): Promise<{ status: number; json: unknown }> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const endpoint = path.split('/').slice(0, 2).join('/'); // e.g. courier/assign — never ids/AWBs
    const started = Date.now();
    let res: Response;
    try {
      res = await withTimeout(
        doFetch(url, {
          method,
          headers: {
            accept: 'application/json',
            ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
            ...(opts.body ? { 'content-type': 'application/json' } : {}),
          },
          ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        }),
        timeoutMs,
        `shiprocket ${method} ${endpoint}`,
      );
    } catch (err) {
      log.warn({ endpoint, ms: Date.now() - started, err: (err as Error).message }, 'shiprocket call failed');
      cfg.reporter?.breadcrumb?.('shiprocket', `${method} ${endpoint} network error`);
      throw new ShiprocketError((err as Error).message, null, true);
    }
    const json: unknown = await res.json().catch(() => ({}));
    const ms = Date.now() - started;
    log.info({ endpoint, status: res.status, ms }, 'shiprocket call');
    cfg.reporter?.breadcrumb?.('shiprocket', `${method} ${endpoint}`, { status: res.status, ms });
    return { status: res.status, json };
  }

  const messageOf = (json: unknown) => {
    const m = (json as { message?: unknown })?.message;
    return typeof m === 'string' ? m.slice(0, 300) : 'request failed';
  };

  // ── Token: Redis-cached, refreshed under a SET NX PX lock so workers don't stampede login ─────
  async function login(): Promise<string> {
    const { status, json } = await http('POST', 'auth/login', { body: { email: cfg.email, password: cfg.password } });
    if (status !== 200) {
      throw new ShiprocketError(
        `shiprocket login ${status}: ${messageOf(json)}`,
        status,
        status >= 500 || status === 429,
      );
    }
    const { token } = LoginResponse.parse(json);
    await cfg.redis.set(TOKEN_KEY, token, 'EX', TOKEN_TTL_SEC);
    return token;
  }

  async function token(force = false, stale?: string): Promise<string> {
    if (!force) {
      const cached = await cfg.redis.get(TOKEN_KEY);
      if (cached) return cached;
    }
    for (let i = 0; i < 50; i++) {
      const got = await cfg.redis.set(LOCK_KEY, '1', 'PX', 15_000, 'NX');
      if (got === 'OK') {
        try {
          // Someone may have refreshed while we waited for the lock
          const current = await cfg.redis.get(TOKEN_KEY);
          if (current && current !== stale) return current;
          return await login();
        } finally {
          await cfg.redis.del(LOCK_KEY);
        }
      }
      await new Promise((r) => setTimeout(r, 100));
      const fresh = await cfg.redis.get(TOKEN_KEY);
      if (fresh && fresh !== stale) return fresh;
    }
    throw new ShiprocketError('shiprocket token refresh lock timed out', null, true);
  }

  /** Authenticated call with one forced re-login on 401 (expired/revoked token). */
  async function call<S extends z.ZodType>(
    schema: S,
    method: 'GET' | 'POST',
    path: string,
    opts: { body?: unknown; query?: Record<string, string>; okStatuses?: number[] } = {},
  ): Promise<{ status: number; data: z.infer<S> | null }> {
    let t = await token();
    let res = await http(method, path, { ...opts, token: t });
    if (res.status === 401) {
      t = await token(true, t);
      res = await http(method, path, { ...opts, token: t });
    }
    const { status, json } = res;
    if (opts.okStatuses?.includes(status) && status !== 200) return { status, data: null };
    if (status < 200 || status >= 300) {
      throw new ShiprocketError(
        `shiprocket ${path.split('/').slice(0, 2).join('/')} ${status}: ${messageOf(json)}`,
        status,
        status >= 500 || status === 429,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ShiprocketError(
        `shiprocket ${path.split('/').slice(0, 2).join('/')}: unexpected response shape`,
        status,
        false,
      );
    }
    return { status, data: parsed.data };
  }

  return {
    async checkServiceability({ pickupPincode, deliveryPincode, weightKg }) {
      const { data } = await call(ServiceabilityResponse, 'GET', 'courier/serviceability/', {
        query: {
          pickup_postcode: pickupPincode,
          delivery_postcode: deliveryPincode,
          weight: String(weightKg),
          cod: '0',
        },
        okStatuses: [404], // "no courier for this pincode"
      });
      return (data?.data?.available_courier_companies ?? []).map((c) => ({
        courierId: c.courier_company_id,
        courierName: c.courier_name,
        ratePaise: rupeesToPaise(c.rate),
        rating: c.rating ?? null,
        etdDays: c.estimated_delivery_days ?? null,
        etd: c.etd ?? null,
      }));
    },

    async createOrder(payload) {
      const { data } = await call(CreateOrderResponse, 'POST', 'orders/create/adhoc', { body: payload });
      return { shiprocketOrderId: data!.order_id, shipmentId: data!.shipment_id };
    },

    async assignAwb(shipmentId, courierId) {
      const { data } = await call(AssignAwbResponse, 'POST', 'courier/assign/awb', {
        body: { shipment_id: shipmentId, courier_id: courierId },
      });
      const awb = data!.response?.data.awb_code;
      if (data!.awb_assign_status !== 1 || !awb) {
        // e.g. courier temporarily not accepting, wallet low — retry, then dead-letter
        throw new ShiprocketError(`shiprocket AWB not assigned: ${data!.message ?? 'unknown reason'}`, 200, true);
      }
      return { awb, courierName: data!.response?.data.courier_name ?? null };
    },

    async generateLabel(shipmentIds) {
      const { data } = await call(LabelResponse, 'POST', 'courier/generate/label', {
        body: { shipment_id: shipmentIds },
      });
      if (data!.label_created !== 1 || !data!.label_url) {
        throw new ShiprocketError('shiprocket label not created yet', 200, true);
      }
      return { labelUrl: data!.label_url };
    },

    async generatePickup(shipmentIds, pickupDate) {
      const { data } = await call(PickupResponse, 'POST', 'courier/generate/pickup', {
        body: { shipment_id: shipmentIds, pickup_date: [pickupDate] },
      });
      if (data!.pickup_status !== 1) throw new ShiprocketError('shiprocket pickup not generated', 200, true);
      return {
        pickupToken: data!.response?.pickup_token_number ?? null,
        scheduledDate: data!.response?.pickup_scheduled_date ?? null,
      };
    },

    async generateManifest(shipmentIds) {
      const { data } = await call(ManifestResponse, 'POST', 'manifests/generate', {
        body: { shipment_id: shipmentIds },
      });
      return { manifestUrl: data!.manifest_url ?? null };
    },

    async cancelShipment(awbs) {
      await call(z.unknown(), 'POST', 'orders/cancel/shipment/awbs', { body: { awbs } });
    },

    async cancelOrder(ids) {
      await call(z.unknown(), 'POST', 'orders/cancel', { body: { ids: ids.map(Number) } });
    },

    async trackByAwb(awb) {
      const { data } = await call(TrackResponse, 'GET', `courier/track/awb/${encodeURIComponent(awb)}`);
      const td = data!.tracking_data;
      const weight = td.shipment_track?.[0]?.weight;
      const kg = weight == null || weight === '' ? NaN : Number(weight);
      return {
        activities: (td.shipment_track_activities ?? []).map((a) => {
          const id = a['sr-status'] == null || a['sr-status'] === '' ? NaN : Number(a['sr-status']);
          return {
            date: a.date,
            statusText: a['sr-status-label'] || a.activity || a.status || 'UNKNOWN',
            statusId: Number.isFinite(id) ? id : null,
            location: a.location ?? null,
          };
        }),
        chargedWeightG: Number.isFinite(kg) && kg > 0 ? Math.round(kg * 1000) : null,
        etd: td.etd ?? td.shipment_track?.[0]?.edd ?? null,
      };
    },

    async getWalletBalancePaise() {
      const { data } = await call(WalletResponse, 'GET', 'account/details/wallet-balance');
      return rupeesToPaise(data!.data.balance_amount);
    },

    async downloadDocument(url) {
      let res: Response;
      try {
        res = await withTimeout(doFetch(url), 20_000, 'shiprocket document download');
      } catch (err) {
        throw new ShiprocketError((err as Error).message, null, true);
      }
      if (!res.ok)
        throw new ShiprocketError(
          `document download ${res.status}`,
          res.status,
          res.status >= 500 || res.status === 404,
        );
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
