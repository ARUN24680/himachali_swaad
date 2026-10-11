/**
 * pnpm db:seed:catalog [--demo] — the six launch SKUs (Phase 3 §3.2), always as DRAFTS (is_active = false).
 * GST (Q-01), lab shelf life (Q-07) and packed weight (D-34) stay empty until confirmed; the admin
 * fills them in and publishes from the admin portal. Idempotent: existing SKUs are never touched.
 *
 * --demo (never in production): fills PLACEHOLDER compliance values and logs a few batches through
 * the real inventory service, so local dev has FRESH / AGING / NOT_SELLABLE stock to look at.
 * --demo --publish: also writes placeholder jar photos to LOCAL storage and publishes the six SKUs
 * (storefront dev + Playwright e2e). Refused unless STORAGE_DRIVER=local.
 */
import { todayInIST } from '@pk/shared';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createDb } from '../src/config/db';
import { parseEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { storageFromEnv } from '../src/config/storage';
import type { LocalDiskStorage } from '../src/integrations/storage/local-disk';
import type { AuthContext } from '../src/middleware/auth';
import { placeholderJarPng } from './placeholder-png';
import { createInventoryService } from '../src/modules/inventory/inventory.service';
import { createSettingsService } from '../src/modules/settings/settings.service';

interface SeedProduct {
  sku: string;
  slug: string;
  group: string;
  title: string;
  meat: 'CHICKEN' | 'MUTTON' | 'FISH';
  grams: number;
  pricePaise: number;
  short: string;
  description: string;
  sortOrder: number;
}

const GROUPS = [
  {
    group: 'himachali-chicken-pickle',
    sku: 'CHK',
    title: 'Himachali Chicken Pickle',
    meat: 'CHICKEN',
    prices: [44_900, 84_900],
    short: 'Boneless chicken slow-cooked in mustard oil with hand-pounded pahadi spices.',
    description:
      'Small-batch chicken pickle from a Himachal kitchen — boneless pieces slow-cooked in cold-pressed mustard oil with hand-pounded spices, matured for depth.',
  },
  {
    group: 'pahadi-mutton-pickle',
    sku: 'MTN',
    title: 'Pahadi Mutton Pickle',
    meat: 'MUTTON',
    prices: [54_900, 99_900],
    short: 'Tender mutton pieces in a robust, smoky masala.',
    description:
      'Mutton pickle in the pahadi style — tender pieces cooked low and slow in mustard oil with whole spices and a smoky finish.',
  },
  {
    group: 'himalayan-trout-pickle',
    sku: 'TRT',
    title: 'Himalayan Trout Pickle',
    meat: 'FISH',
    prices: [59_900, 109_900],
    short: 'Cold-water trout, lightly fried and pickled with mountain spices.',
    description:
      'Rainbow trout from Himachal’s cold streams, lightly fried and pickled with mustard, garlic and mountain spices.',
  },
] as const;

const PRODUCTS: SeedProduct[] = GROUPS.flatMap((g, gi) =>
  ([250, 500] as const).map((grams, wi) => ({
    sku: `${g.sku}${grams}`,
    slug: `${g.group}-${grams}g`,
    group: g.group,
    title: g.title,
    meat: g.meat,
    grams,
    pricePaise: g.prices[wi]!,
    short: g.short,
    description: g.description,
    sortOrder: gi * 10 + wi,
  })),
);

async function main() {
  const demo = process.argv.includes('--demo');
  const publish = process.argv.includes('--publish');
  if (demo && process.env.NODE_ENV === 'production') throw new Error('--demo is not allowed in production');
  if (publish && !demo) throw new Error('--publish only works together with --demo');

  const db = createDb(
    {
      connectionString: z.url().parse(process.env.DATABASE_URL),
      max: 2,
      slowQueryMs: 10_000,
      applicationName: 'pk-seed',
      ssl: process.env.NODE_ENV === 'production',
    },
    createLogger({ level: 'warn', name: 'pk-seed' }),
  );

  let created = 0;
  for (const p of PRODUCTS) {
    const { rowCount } = await db.query(
      `INSERT INTO products (sku, slug, product_group, title, short_description, description, meat_type,
                             net_weight_g, price_paise, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (sku) DO NOTHING`,
      [p.sku, p.slug, p.group, p.title, p.short, p.description, p.meat, p.grams, p.pricePaise, p.sortOrder],
    );
    created += rowCount ?? 0;
  }
  process.stdout.write(`✔ Products: ${created} created, ${PRODUCTS.length - created} already existed (drafts)\n`);

  if (demo) {
    await db.query(
      `UPDATE products SET
         gst_rate_bp = COALESCE(gst_rate_bp, 500),
         shelf_life_days = COALESCE(shelf_life_days, 180),
         packed_weight_g = COALESCE(packed_weight_g, net_weight_g + 230),
         ingredients = COALESCE(ingredients, 'PLACEHOLDER — meat, mustard oil, garlic, ginger, red chilli, salt, spices'),
         nutrition = COALESCE(nutrition, '{"energy_kcal":310,"protein_g":18,"fat_g":24,"carbs_g":6,"sugar_g":1,"sodium_mg":1450}')
       WHERE sku = ANY($1::text[])`,
      [PRODUCTS.map((p) => p.sku)],
    );

    const admin = await db.query<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' AND is_active LIMIT 1");
    if (!admin.rows[0]) throw new Error('Run pnpm db:seed:staff first (demo batches need an ADMIN actor)');
    const existing = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM inventory_batches');
    if (existing.rows[0]!.n > 0) {
      process.stdout.write('• Batches already exist — demo batches skipped\n');
    } else {
      const inventory = createInventoryService({
        db,
        settings: createSettingsService(),
        revalidator: { revalidate: async () => undefined },
      });
      const auth: AuthContext = { userId: admin.rows[0].id, role: 'ADMIN', pickupLocationIds: [] };
      const ids = await db.query<{ id: string; sku: string }>('SELECT id, sku FROM products ORDER BY sort_order');
      const daysAgo = (n: number) => {
        const d = new Date(`${todayInIST()}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - n);
        return d.toISOString().slice(0, 10);
      };
      for (const p of ids.rows) {
        await inventory.createBatch(auth, { productId: p.id, quantity: 48, totalCostPaise: 48 * 21_000 }, { ip: null });
      }
      // Shelf-status examples on CHK250 (shelf life 180, buffer 45 + 7): AGING (70 d left), NOT_SELLABLE (30 d left)
      const chk = ids.rows.find((p) => p.sku === 'CHK250')!;
      for (const [ago, qty] of [
        [110, 12],
        [150, 6],
      ] as const) {
        await inventory.createBatch(
          auth,
          { productId: chk.id, quantity: qty, totalCostPaise: qty * 20_000, manufacturedAt: daysAgo(ago) },
          { ip: null },
        );
      }
      process.stdout.write(`✔ Demo batches logged for ${ids.rows.length} products (+2 shelf-status examples)\n`);
    }
    if (publish) await publishDemo(db);
    process.stdout.write(
      '  ⚠ Demo values are PLACEHOLDERS (GST, shelf life, nutrition) — never use them in production.\n',
    );
  }

  if (!publish) {
    process.stdout.write(
      '  Products stay unpublished: add photos + confirmed details, then publish in the admin portal.\n',
    );
  }
  await db.close();
}

// Per meat type: background gradient top/bottom, jar body, lid (RGB — seed data, not UI styling)
const PALETTE: Record<string, { top: Rgb; bottom: Rgb; jar: Rgb; lid: Rgb }> = {
  CHICKEN: { top: [243, 235, 220], bottom: [212, 163, 89], jar: [150, 72, 36], lid: [33, 29, 26] },
  MUTTON: { top: [234, 227, 210], bottom: [150, 72, 36], jar: [94, 38, 22], lid: [33, 29, 26] },
  FISH: { top: [236, 240, 236], bottom: [44, 59, 52], jar: [176, 112, 52], lid: [33, 29, 26] },
};
type Rgb = readonly [number, number, number];

/** Placeholder photos into LOCAL storage, then publish (the products_publishable CHECK still applies). */
async function publishDemo(db: ReturnType<typeof createDb>) {
  const env = parseEnv(process.env);
  if (env.STORAGE_DRIVER !== 'local')
    throw new Error('--publish writes placeholder photos and needs STORAGE_DRIVER=local');
  const storage = storageFromEnv(env) as LocalDiskStorage;
  const products = await db.query<{ id: string; meat_type: string; images: string[] }>(
    'SELECT id, meat_type, images FROM products WHERE sku = ANY($1::text[])',
    [PRODUCTS.map((p) => p.sku)],
  );
  for (const p of products.rows) {
    const images = [...p.images];
    if (images.length === 0) {
      const key = `products/${p.id}/${randomUUID()}.png`;
      await storage.write(key, placeholderJarPng(PALETTE[p.meat_type] ?? PALETTE.CHICKEN!));
      images.push(key);
    }
    await db.query('UPDATE products SET images = $2, is_active = TRUE WHERE id = $1', [p.id, images]);
  }
  process.stdout.write(`✔ Published ${products.rowCount} demo products with placeholder photos (local storage)\n`);
}

main().catch((err) => {
  process.stderr.write(`✖ Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
