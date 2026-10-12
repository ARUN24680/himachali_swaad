import {
  AdjustmentRequestSchema,
  AdminProductSchema,
  BatchCreateRequestSchema,
  BatchSchema,
  MovementSchema,
  ProductCreateRequestSchema,
  ProductUpdateRequestSchema,
  missingForPublish,
  shelfStatusFor,
  todayInIST,
  type AdminProduct,
  type Batch,
  type Movement,
  type PickupLocationSummary,
} from '@pk/shared';
import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * Stateful in-memory mock of the Phase 3 catalog + batch API (page.route). Every fixture and every
 * response is parsed through the @pk/shared Zod schemas, so a contract drift fails the spec.
 */
export const API = 'http://localhost:4000/api/v1';
/** App origin for CORS — the PWA spec runs against `vite preview` on another port (playwright.pwa.config.ts). */
export const ORIGIN = process.env.PK_E2E_ORIGIN ?? 'http://localhost:5173';
const CDN = 'https://cdn.pahadikhatki.test';
const STORAGE = 'https://r2-upload.pahadikhatki.test';
const BUFFER = 52; // 45 + 7 (D-24)

export type StaffRole = 'ADMIN' | 'KITCHEN_PARTNER';

const users = {
  ADMIN: {
    id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
    role: 'ADMIN',
    fullName: 'Asha Negi',
    phoneMasked: null,
    email: 'asha@pahadikhatki.in',
    totpEnabled: true,
  },
  KITCHEN_PARTNER: {
    id: '7d3c2a5f-9b4e-4c8d-8f2a-3b4c5d6e7f80',
    role: 'KITCHEN_PARTNER',
    fullName: 'Ramesh Thakur',
    phoneMasked: '+91******3210',
    email: 'ramesh@pahadikhatki.in',
    totpEnabled: false,
  },
} as const;

const ok = (data: unknown) => ({
  success: true,
  data,
  error: null,
  requestId: 'req_e2e',
  timestamp: new Date().toISOString(),
});
const fail = (code: string, message: string, details?: Record<string, unknown>) => ({
  success: false,
  data: null,
  error: { code, message, ...(details ? { details } : {}) },
  requestId: 'req_e2e',
  timestamp: new Date().toISOString(),
});
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT',
};
const reply = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const addDays = (iso: string, d: number) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const NUTRITION = { energyKcal: 312, proteinG: 18.5, fatG: 24, carbsG: 6.2, sugarG: 1.1, sodiumMg: 1450 };

function product(
  n: number,
  p: Partial<AdminProduct> & Pick<AdminProduct, 'sku' | 'title' | 'productGroup' | 'netWeightG' | 'pricePaise'>,
): AdminProduct {
  const now = new Date().toISOString();
  const base = {
    id: uuid(n),
    slug: `${p.productGroup}-${p.netWeightG}g`,
    shortDescription: 'Slow-cooked in cold-pressed mustard oil',
    description: 'Hand-cut meat, sun-dried hill spices and mustard oil, bottled in small batches in Kullu.',
    meatType: 'CHICKEN' as const,
    packedWeightG: p.netWeightG === 250 ? 470 : 820,
    packageLengthCm: 15,
    packageBreadthCm: 10,
    packageHeightCm: 10,
    comparePricePaise: null,
    hsnCode: '2001',
    gstRateBp: 500,
    ingredients: 'Chicken (60%), mustard oil, garlic, red chilli, salt, spices',
    allergens: 'Mustard',
    spiceLevel: 3,
    shelfLifeDays: 180,
    storageInstructions: 'Refrigerate after opening',
    nutrition: NUTRITION,
    sortOrder: n,
    images: [{ key: `products/${uuid(n)}/${uuid(900 + n)}.webp`, url: `${CDN}/jar-${n % 3}.svg` }],
    isActive: true,
    stock: { sellable: 0, onHand: 0 },
    missingForPublish: [],
    createdAt: now,
    updatedAt: now,
  };
  const merged = { ...base, ...p };
  return AdminProductSchema.parse({ ...merged, missingForPublish: missingForPublish(merged) });
}

const kitchen: PickupLocationSummary = {
  id: uuid(500),
  code: 'KULLU-01',
  name: 'Kullu Kitchen',
  city: 'Kullu',
  state: 'Himachal Pradesh',
  isActive: true,
};

export function seed() {
  const products: AdminProduct[] = [
    product(1, {
      sku: 'CHK250',
      title: 'Himachali Chicken Pickle',
      productGroup: 'himachali-chicken-pickle',
      netWeightG: 250,
      pricePaise: 39900,
      comparePricePaise: 44900,
    }),
    product(2, {
      sku: 'CHK500',
      title: 'Himachali Chicken Pickle',
      productGroup: 'himachali-chicken-pickle',
      netWeightG: 500,
      pricePaise: 74900,
    }),
    product(3, {
      sku: 'MTN250',
      title: 'Pahadi Mutton Pickle',
      productGroup: 'pahadi-mutton-pickle',
      netWeightG: 250,
      pricePaise: 54900,
      meatType: 'MUTTON',
    }),
    product(4, {
      sku: 'TRT250',
      title: 'Himalayan Trout Pickle',
      productGroup: 'himalayan-trout-pickle',
      netWeightG: 250,
      pricePaise: 62000,
      meatType: 'FISH',
      isActive: false,
      gstRateBp: null,
      shelfLifeDays: null,
      nutrition: null,
      packedWeightG: null,
      images: [],
    }),
  ];
  const today = todayInIST();
  const mk = (
    n: number,
    prod: AdminProduct,
    mfgAgoDays: number,
    initial: number,
    available: number,
    cost: number,
  ): Batch => {
    const manufacturedAt = addDays(today, -mfgAgoDays);
    const expiryDate = addDays(manufacturedAt, prod.shelfLifeDays ?? 180);
    const daysToExpiry = daysBetween(today, expiryDate);
    return BatchSchema.parse({
      id: uuid(100 + n),
      batchCode: `PK-${manufacturedAt.slice(2, 4)}${manufacturedAt.slice(5, 7)}-${prod.sku}-0${n}`,
      product: { id: prod.id, sku: prod.sku, title: prod.title, netWeightG: prod.netWeightG },
      pickupLocation: { id: kitchen.id, code: kitchen.code, name: kitchen.name },
      manufacturedAt,
      expiryDate,
      initialQuantity: initial,
      availableStock: available,
      totalCostPaise: cost,
      costPerUnitPaise: Math.round(cost / initial),
      notes: n === 1 ? 'First winter lot' : null,
      daysToExpiry,
      shelfStatus: shelfStatusFor(daysToExpiry, BUFFER),
      createdAt: new Date(`${manufacturedAt}T10:00:00Z`).toISOString(),
    });
  };
  const [chk250, chk500, mtn250] = products as [AdminProduct, AdminProduct, AdminProduct];
  const batches: Batch[] = [
    mk(1, chk250, 183, 40, 6, 480000), // expired
    mk(2, mtn250, 150, 30, 9, 540000), // not sellable
    mk(3, chk250, 110, 60, 22, 720000), // aging
    mk(4, chk500, 40, 50, 48, 1150000), // fresh
    mk(5, chk250, 12, 80, 80, 960000), // fresh
  ];
  const movements = new Map<string, Movement[]>();
  for (const b of batches) {
    const list: Movement[] = [
      MovementSchema.parse({
        id: 1000 + Number(b.id.slice(-3)) * 10,
        type: 'PRODUCTION',
        quantityDelta: b.initialQuantity,
        balanceAfter: b.initialQuantity,
        reason: null,
        orderId: null,
        actorName: 'Ramesh Thakur',
        createdAt: b.createdAt,
      }),
    ];
    if (b.availableStock < b.initialQuantity) {
      list.unshift(
        MovementSchema.parse({
          id: 1001 + Number(b.id.slice(-3)) * 10,
          type: 'RESERVE',
          quantityDelta: b.availableStock - b.initialQuantity,
          balanceAfter: b.availableStock,
          reason: null,
          orderId: uuid(700),
          actorName: null,
          createdAt: new Date(Date.parse(b.createdAt) + 5 * 86_400_000).toISOString(),
        }),
      );
    }
    movements.set(b.id, list);
  }
  return { products, batches, movements, today };
}

export interface MockOptions {
  role?: StaffRole;
  empty?: boolean;
  /** Make list endpoints fail (error state). */
  failLists?: boolean;
  /** Keep list endpoints pending forever (loading state). */
  hangLists?: boolean;
}

/** Install the mock; returns live state + recorded request bodies for assertions. */
/** `page` may be a BrowserContext: the PWA spec mocks every page + the service worker at context level. */
export async function mockCatalogApi(page: Page | BrowserContext, opts: MockOptions = {}) {
  const role = opts.role ?? 'ADMIN';
  const state = seed();
  if (opts.empty) {
    state.products = [];
    state.batches = [];
  }
  const bodies: Record<string, unknown[]> = {};
  const record = (key: string, body: unknown) => (bodies[key] ??= []).push(body);
  let nextId = 2000;

  const recomputeStock = () => {
    for (const p of state.products) {
      const mine = state.batches.filter((b) => b.product.id === p.id);
      p.stock = {
        onHand: mine.reduce((n, b) => n + b.availableStock, 0),
        sellable: mine
          .filter((b) => b.shelfStatus === 'FRESH' || b.shelfStatus === 'AGING')
          .reduce((n, b) => n + b.availableStock, 0),
      };
    }
  };
  recomputeStock();

  // Product photos (CDN) and presigned storage uploads
  await page.route(`${CDN}/**`, (route) => {
    const n = Number(/jar-(\d)/.exec(route.request().url())?.[1] ?? 0);
    const fills = ['#C9853E', '#8E3B1F', '#B9702C']; // test-only artwork
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#EFE6D5"/><rect x="36" y="22" width="48" height="14" rx="3" fill="#2E3A33"/><rect x="30" y="36" width="60" height="70" rx="10" fill="${fills[n]}"/><rect x="38" y="56" width="44" height="26" rx="3" fill="#F8F5EF"/></svg>`;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  await page.route(`${STORAGE}/**`, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT',
          'access-control-allow-headers': '*',
        },
      });
    record('storage-put', { headers: route.request().headers() });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
  });

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const body = method === 'GET' ? undefined : (req.postDataJSON() as unknown);
    if (body !== undefined) record(`${method} ${path.replace(/[0-9a-f-]{36}/g, ':id')}`, body);

    if (path === '/auth/me')
      return reply(route, 200, ok({ user: users[role], pickupLocationIds: role === 'ADMIN' ? [] : [kitchen.id] }));

    const isList = method === 'GET' && (path === '/admin/products' || path === '/batches');
    if (isList && opts.hangLists) return; // never resolves → skeleton stays
    if (isList && opts.failLists)
      return reply(route, 500, fail('INTERNAL_ERROR', 'The server had a hiccup. Please try again.'));

    // ── Products (ADMIN) ──
    if (path.startsWith('/admin/') && role !== 'ADMIN') return reply(route, 403, fail('FORBIDDEN', 'Not allowed'));
    if (path === '/admin/products' && method === 'GET') return reply(route, 200, ok({ products: state.products }));
    if (path === '/admin/products' && method === 'POST') {
      const parsed = ProductCreateRequestSchema.safeParse(body);
      if (!parsed.success) return reply(route, 400, fail('VALIDATION_ERROR', 'Invalid product'));
      if (state.products.some((p) => p.sku === parsed.data.sku))
        return reply(route, 409, fail('DUPLICATE', 'SKU already exists', { field: 'sku' }));
      const created = product(nextId++, {
        ...parsed.data,
        images: [],
        isActive: false,
        sortOrder: parsed.data.sortOrder,
      });
      state.products.push(created);
      return reply(route, 201, ok({ product: created }));
    }
    const productMatch = /^\/admin\/products\/([0-9a-f-]{36})(?:\/(publish|unpublish))?$/.exec(path);
    if (productMatch) {
      const p = state.products.find((x) => x.id === productMatch[1]);
      if (!p) return reply(route, 404, fail('NOT_FOUND', 'Product not found'));
      const action = productMatch[2];
      if (!action && method === 'GET') return reply(route, 200, ok({ product: p }));
      if (!action && method === 'PATCH') {
        const parsed = ProductUpdateRequestSchema.safeParse(body);
        if (!parsed.success) return reply(route, 400, fail('VALIDATION_ERROR', 'Invalid update'));
        const { images, ...fields } = parsed.data;
        Object.assign(p, fields);
        if (images) p.images = images.map((key) => ({ key, url: `${CDN}/jar-${key.length % 3}.svg` }));
        p.missingForPublish = missingForPublish(p);
        p.updatedAt = new Date().toISOString();
        return reply(route, 200, ok({ product: AdminProductSchema.parse(p) }));
      }
      if (action === 'publish') {
        if (p.missingForPublish.length)
          return reply(
            route,
            422,
            fail('VALIDATION_FAILED', 'Product is not ready to publish', { missing: p.missingForPublish }),
          );
        p.isActive = true;
        return reply(route, 200, ok({ product: p }));
      }
      if (action === 'unpublish') {
        p.isActive = false;
        return reply(route, 200, ok({ product: p }));
      }
    }
    if (path === '/admin/uploads/product-image' && method === 'POST') {
      const { productId, contentType } = body as { productId: string; contentType: string };
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
      const key = `products/${productId}/${uuid(nextId++)}.${ext}`;
      return reply(
        route,
        200,
        ok({
          key,
          uploadUrl: `${STORAGE}/${key}?sig=abc`,
          method: 'PUT',
          headers: { 'content-type': contentType },
          publicUrl: `${CDN}/jar-1.svg`,
          expiresInSec: 600,
        }),
      );
    }

    // ── Batches (ADMIN + KITCHEN_PARTNER) ──
    if (path === '/batches/product-options')
      return reply(
        route,
        200,
        ok({
          products: state.products.map(({ id, sku, title, netWeightG, shelfLifeDays, isActive }) => ({
            id,
            sku,
            title,
            netWeightG,
            shelfLifeDays,
            isActive,
          })),
        }),
      );
    if (path === '/partner/pickup-locations') return reply(route, 200, ok({ locations: [kitchen] }));
    if (path === '/batches' && method === 'GET') {
      const productId = url.searchParams.get('productId');
      const status = url.searchParams.get('status');
      const includeEmpty = url.searchParams.get('includeEmpty') === 'true';
      const list = state.batches
        .filter(
          (b) =>
            (!productId || b.product.id === productId) &&
            (!status || b.shelfStatus === status) &&
            (includeEmpty || b.availableStock > 0),
        )
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.manufacturedAt.localeCompare(b.manufacturedAt));
      return reply(route, 200, ok({ batches: list, sellableBufferDays: BUFFER }));
    }
    if (path === '/batches' && method === 'POST') {
      const parsed = BatchCreateRequestSchema.safeParse(body);
      if (!parsed.success) return reply(route, 400, fail('VALIDATION_ERROR', 'Invalid batch'));
      const prod = state.products.find((p) => p.id === parsed.data.productId);
      if (!prod?.shelfLifeDays)
        return reply(route, 422, fail('VALIDATION_FAILED', 'Shelf life is not set for this product'));
      const manufacturedAt = parsed.data.manufacturedAt ?? state.today;
      const seq =
        state.batches.filter(
          (b) => b.product.id === prod.id && b.manufacturedAt.slice(0, 7) === manufacturedAt.slice(0, 7),
        ).length + 1;
      const expiryDate = addDays(manufacturedAt, prod.shelfLifeDays);
      const daysToExpiry = daysBetween(state.today, expiryDate);
      const batch = BatchSchema.parse({
        id: uuid(nextId++),
        batchCode: `PK-${manufacturedAt.slice(2, 4)}${manufacturedAt.slice(5, 7)}-${prod.sku}-${String(seq).padStart(2, '0')}`,
        product: { id: prod.id, sku: prod.sku, title: prod.title, netWeightG: prod.netWeightG },
        pickupLocation: { id: kitchen.id, code: kitchen.code, name: kitchen.name },
        manufacturedAt,
        expiryDate,
        initialQuantity: parsed.data.quantity,
        availableStock: parsed.data.quantity,
        totalCostPaise: parsed.data.totalCostPaise,
        costPerUnitPaise: Math.round(parsed.data.totalCostPaise / parsed.data.quantity),
        notes: parsed.data.notes ?? null,
        daysToExpiry,
        shelfStatus: shelfStatusFor(daysToExpiry, BUFFER),
        createdAt: new Date().toISOString(),
      });
      state.batches.push(batch);
      state.movements.set(batch.id, [
        MovementSchema.parse({
          id: nextId++,
          type: 'PRODUCTION',
          quantityDelta: batch.initialQuantity,
          balanceAfter: batch.initialQuantity,
          reason: null,
          orderId: null,
          actorName: users[role].fullName,
          createdAt: batch.createdAt,
        }),
      ]);
      recomputeStock();
      return reply(route, 201, ok({ batch }));
    }
    const batchMatch = /^\/batches\/([0-9a-f-]{36})(?:\/(adjustments|movements))?$/.exec(path);
    if (batchMatch) {
      const b = state.batches.find((x) => x.id === batchMatch[1]);
      if (!b) return reply(route, 404, fail('NOT_FOUND', 'Batch not found'));
      if (batchMatch[2] === 'movements') return reply(route, 200, ok({ movements: state.movements.get(b.id) ?? [] }));
      if (batchMatch[2] === 'adjustments') {
        const parsed = AdjustmentRequestSchema.safeParse(body);
        if (!parsed.success) return reply(route, 400, fail('VALIDATION_ERROR', 'Invalid adjustment'));
        const after = b.availableStock + parsed.data.quantityDelta;
        if (after < 0 || after > b.initialQuantity)
          return reply(route, 409, fail('INSUFFICIENT_STOCK', 'Not enough stock'));
        b.availableStock = after;
        state.movements.get(b.id)?.unshift(
          MovementSchema.parse({
            id: nextId++,
            type: parsed.data.type,
            quantityDelta: parsed.data.quantityDelta,
            balanceAfter: after,
            reason: parsed.data.reason,
            orderId: null,
            actorName: users[role].fullName,
            createdAt: new Date().toISOString(),
          }),
        );
        recomputeStock();
        return reply(route, 200, ok({ batch: b }));
      }
      if (method === 'PATCH') {
        b.notes = (body as { notes: string | null }).notes;
        return reply(route, 200, ok({ batch: b }));
      }
    }
    return reply(route, 404, fail('NOT_FOUND', `No mock for ${method} ${path}`));
  });

  return { state, bodies };
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error(`Horizontal overflow of ${overflow}px`);
}
