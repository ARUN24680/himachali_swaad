import { BatchRowSchema, MovementTypeEnum, type MovementType } from '@pk/shared';
import { z } from 'zod';
import type { Queryable } from '../../config/db';

const BatchViewRowSchema = BatchRowSchema.extend({
  days_to_expiry: z.number().int(),
  product_sku: z.string(),
  product_title: z.string(),
  product_net_weight_g: z.number().int(),
  location_code: z.string(),
  location_name: z.string(),
});
export type BatchViewRow = z.infer<typeof BatchViewRowSchema>;

const BATCH_VIEW_SELECT = `
  SELECT b.*, (b.expiry_date - ist_today())::int AS days_to_expiry,
         p.sku AS product_sku, p.title AS product_title, p.net_weight_g AS product_net_weight_g,
         l.code AS location_code, l.name AS location_name
    FROM inventory_batches b
    JOIN products p ON p.id = b.product_id
    JOIN pickup_locations l ON l.id = b.pickup_location_id`;

export async function findBatchView(db: Queryable, id: string): Promise<BatchViewRow | null> {
  const { rows } = await db.query(`${BATCH_VIEW_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ? BatchViewRowSchema.parse(rows[0]) : null;
}

/** FIFO order (D-23): earliest expiry first. `locationIds` null = all kitchens (ADMIN). */
export async function listBatchViews(
  db: Queryable,
  f: { productId: string | null; locationIds: string[] | null; includeEmpty: boolean },
): Promise<BatchViewRow[]> {
  const { rows } = await db.query(
    `${BATCH_VIEW_SELECT}
      WHERE ($1::uuid IS NULL OR b.product_id = $1)
        AND ($2::uuid[] IS NULL OR b.pickup_location_id = ANY($2::uuid[]))
        AND ($3::boolean OR b.available_stock > 0)
      ORDER BY b.expiry_date ASC, b.manufactured_at ASC, b.batch_code ASC
      LIMIT 500`,
    [f.productId, f.locationIds, f.includeEmpty],
  );
  return rows.map((r) => BatchViewRowSchema.parse(r));
}

export async function findBatchLocationId(db: Queryable, id: string): Promise<string | null> {
  const { rows } = await db.query<{ pickup_location_id: string }>(
    'SELECT pickup_location_id FROM inventory_batches WHERE id = $1',
    [id],
  );
  return rows[0]?.pickup_location_id ?? null;
}

/** FOR SHARE: shelf_life_days / sku can't change while the batch is being registered. */
export async function lockProductForBatch(client: Queryable, productId: string) {
  const { rows } = await client.query<{ id: string; sku: string; shelf_life_days: number | null }>(
    'SELECT id, sku, shelf_life_days FROM products WHERE id = $1 FOR SHARE',
    [productId],
  );
  return rows[0] ?? null;
}

export async function listActiveLocationIds(db: Queryable): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM pickup_locations WHERE is_active ORDER BY code');
  return rows.map((r) => r.id);
}

export async function isActiveLocation(db: Queryable, id: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM pickup_locations WHERE id = $1 AND is_active', [id]);
  return rows.length > 0;
}

/**
 * Next per-product-per-month sequence for a batch-code prefix (D-42). The transaction-scoped
 * advisory lock serialises concurrent registrations for the same prefix; the UNIQUE constraint
 * on batch_code stays as the backstop.
 */
export async function nextBatchSeq(client: Queryable, prefix: string): Promise<number> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
  const { rows } = await client.query<{ seq: number }>(
    `SELECT COALESCE(MAX(substring(batch_code FROM '-([0-9]+)$')::int), 0) + 1 AS seq
       FROM inventory_batches WHERE starts_with(batch_code, $1)`,
    [prefix],
  );
  return rows[0]!.seq;
}

export async function insertBatch(
  client: Queryable,
  b: {
    productId: string;
    pickupLocationId: string;
    batchCode: string;
    manufacturedAt: string;
    shelfLifeDays: number;
    quantity: number;
    totalCostPaise: number;
    createdById: string;
    notes: string | null;
  },
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO inventory_batches
       (product_id, pickup_location_id, batch_code, manufactured_at, expiry_date,
        initial_quantity, available_stock, total_cost_paise, created_by_id, notes)
     VALUES ($1, $2, $3, $4::date, $4::date + $5::int, $6, $6, $7, $8, $9)
     RETURNING id`,
    [
      b.productId,
      b.pickupLocationId,
      b.batchCode,
      b.manufacturedAt,
      b.shelfLifeDays,
      b.quantity,
      b.totalCostPaise,
      b.createdById,
      b.notes,
    ],
  );
  return rows[0]!.id;
}

export async function lockBatch(client: Queryable, id: string) {
  const { rows } = await client.query('SELECT * FROM inventory_batches WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ? BatchRowSchema.parse(rows[0]) : null;
}

export async function setBatchStock(client: Queryable, id: string, availableStock: number): Promise<void> {
  await client.query('UPDATE inventory_batches SET available_stock = $2 WHERE id = $1', [id, availableStock]);
}

export async function setBatchNotes(client: Queryable, id: string, notes: string | null): Promise<void> {
  await client.query('UPDATE inventory_batches SET notes = $2 WHERE id = $1', [id, notes]);
}

export async function insertMovement(
  client: Queryable,
  m: { batchId: string; type: MovementType; quantityDelta: number; actorId: string | null; reason: string | null },
): Promise<void> {
  await client.query(
    `INSERT INTO inventory_movements (batch_id, movement_type, quantity_delta, actor_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [m.batchId, m.type, m.quantityDelta, m.actorId, m.reason],
  );
}

const MovementViewRowSchema = z.object({
  id: z.number().int(),
  movement_type: MovementTypeEnum,
  quantity_delta: z.number().int(),
  balance_after: z.number().int(),
  reason: z.string().nullable(),
  order_id: z.uuid().nullable(),
  actor_name: z.string().nullable(),
  created_at: z.date(),
});

/** Ledger with running balance, newest first. */
export async function listMovements(db: Queryable, batchId: string) {
  const { rows } = await db.query(
    `SELECT m.id, m.movement_type, m.quantity_delta, m.reason, m.order_id, m.created_at,
            u.full_name AS actor_name,
            (SUM(m.quantity_delta) OVER (ORDER BY m.id ROWS UNBOUNDED PRECEDING))::int AS balance_after
       FROM inventory_movements m
       LEFT JOIN users u ON u.id = m.actor_id
      WHERE m.batch_id = $1
      ORDER BY m.id DESC`,
    [batchId],
  );
  return rows.map((r) => MovementViewRowSchema.parse(r));
}

/**
 * Ledger invariant (Phase 3 §3.5): available_stock = SUM(quantity_delta) for every batch.
 * Returns the batches that break it — empty means healthy. Phase 5 LEDGER_CHECK reuses this.
 */
export async function findLedgerMismatches(db: Queryable, batchIds: string[] | null = null) {
  const { rows } = await db.query<{ batch_id: string; available_stock: number; ledger_sum: number }>(
    `SELECT b.id AS batch_id, b.available_stock, COALESCE(SUM(m.quantity_delta), 0)::int AS ledger_sum
       FROM inventory_batches b
       LEFT JOIN inventory_movements m ON m.batch_id = b.id
      WHERE ($1::uuid[] IS NULL OR b.id = ANY($1::uuid[]))
      GROUP BY b.id
     HAVING b.available_stock <> COALESCE(SUM(m.quantity_delta), 0)`,
    [batchIds],
  );
  return rows.map((r) => ({ batchId: r.batch_id, availableStock: r.available_stock, ledgerSum: r.ledger_sum }));
}

export async function listProductOptions(db: Queryable) {
  const { rows } = await db.query<{
    id: string;
    sku: string;
    title: string;
    net_weight_g: number;
    shelf_life_days: number | null;
    is_active: boolean;
  }>(
    'SELECT id, sku, title, net_weight_g, shelf_life_days, is_active FROM products ORDER BY sort_order, title, net_weight_g',
  );
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    title: r.title,
    netWeightG: r.net_weight_g,
    shelfLifeDays: r.shelf_life_days,
    isActive: r.is_active,
  }));
}

// ── Order stock reservation (Phase 5, architecture/07 §3–4) ───────────────

/**
 * Sellable batches of one product, FIFO by expiry, LOCKED (D-23, D-24). Same filter as the
 * storefront stock query, so what the shop shows is what checkout can allocate.
 */
export async function lockSellableBatches(client: Queryable, productId: string, sellableBufferDays: number) {
  const { rows } = await client.query<{ id: string; available_stock: number; pickup_location_id: string }>(
    `SELECT b.id, b.available_stock, b.pickup_location_id
       FROM inventory_batches b
      WHERE b.product_id = $1
        AND b.available_stock > 0
        AND b.expiry_date >= ist_today() + $2::int
      ORDER BY b.expiry_date ASC, b.manufactured_at ASC, b.id ASC
      FOR UPDATE`,
    [productId, sellableBufferDays],
  );
  return rows;
}

export async function changeBatchStock(client: Queryable, batchId: string, delta: number): Promise<void> {
  await client.query('UPDATE inventory_batches SET available_stock = available_stock + $2 WHERE id = $1', [
    batchId,
    delta,
  ]);
}

/**
 * Locks batches in the SAME global order reservation uses (product_id, then FIFO expiry order), so
 * a release and a concurrent checkout always acquire locks in one direction — no deadlock cycle.
 */
export async function lockBatchesById(client: Queryable, batchIds: string[]): Promise<void> {
  await client.query(
    `SELECT id FROM inventory_batches WHERE id = ANY($1::uuid[])
      ORDER BY product_id, expiry_date, manufactured_at, id
      FOR UPDATE`,
    [batchIds],
  );
}

export async function insertOrderMovement(
  client: Queryable,
  m: { batchId: string; type: 'RESERVE' | 'RELEASE'; quantityDelta: number; orderId: string; reason: string },
): Promise<void> {
  await client.query(
    `INSERT INTO inventory_movements (batch_id, movement_type, quantity_delta, order_id, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [m.batchId, m.type, m.quantityDelta, m.orderId, m.reason],
  );
}

export async function insertAllocation(
  client: Queryable,
  a: { orderItemId: string; batchId: string; quantity: number; status: 'RESERVED' | 'COMMITTED' },
): Promise<void> {
  await client.query(
    `INSERT INTO order_item_allocations (order_item_id, batch_id, quantity, status) VALUES ($1, $2, $3, $4)`,
    [a.orderItemId, a.batchId, a.quantity, a.status],
  );
}

/** Live allocations of an order in the given statuses, batch-id order. */
export async function listOrderAllocations(client: Queryable, orderId: string, statuses: readonly string[]) {
  const { rows } = await client.query<{
    id: string;
    batch_id: string;
    quantity: number;
    status: 'RESERVED' | 'COMMITTED' | 'RELEASED';
    pickup_location_id: string;
  }>(
    `SELECT a.id, a.batch_id, a.quantity, a.status, b.pickup_location_id
       FROM order_item_allocations a
       JOIN order_items oi ON oi.id = a.order_item_id
       JOIN inventory_batches b ON b.id = a.batch_id
      WHERE oi.order_id = $1 AND a.status = ANY($2::allocation_status[])
      ORDER BY a.batch_id, a.id`,
    [orderId, statuses],
  );
  return rows;
}

export async function setAllocationStatus(
  client: Queryable,
  allocationIds: string[],
  status: 'COMMITTED' | 'RELEASED',
): Promise<void> {
  await client.query('UPDATE order_item_allocations SET status = $2 WHERE id = ANY($1::uuid[])', [
    allocationIds,
    status,
  ]);
}
