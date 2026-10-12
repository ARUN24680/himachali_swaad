import type { Queryable } from '../../config/db';

export async function findPickupLocation(db: Queryable, id: string) {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    is_active: boolean;
  }>('SELECT id, code, name, city, state, is_active FROM pickup_locations WHERE id = $1', [id]);
  const r = rows[0];
  return r ? { id: r.id, code: r.code, name: r.name, city: r.city, state: r.state, isActive: r.is_active } : null;
}

/** `ids` null = every kitchen (ADMIN). */
export async function listPickupLocations(db: Queryable, ids: string[] | null) {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    is_active: boolean;
  }>(
    `SELECT id, code, name, city, state, is_active FROM pickup_locations
      WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[])) ORDER BY code`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    city: r.city,
    state: r.state,
    isActive: r.is_active,
  }));
}

// ── Packing desk (Phase 7) ─────────────────────────────────────────────────────────────────────
// Reads join orders / items / allocations / batches / shipments — read-only, scoped by kitchen.

export interface DeskOrderRow {
  id: string;
  order_code: string;
  status: string;
  pickup_location_id: string;
  customer_name: string;
  city: string;
  state: string;
  confirmed_at: Date | null;
  courier_name: string | null;
  awb_code: string | null;
  label_key: string | null;
  pickup_scheduled_for: string | null;
}

/** `locationIds` null = ADMIN (all kitchens). Oldest confirmed first — FIFO packing. */
export async function listDeskOrders(db: Queryable, status: string, locationIds: string[] | null, limit = 200) {
  const { rows } = await db.query<DeskOrderRow>(
    `SELECT o.id, o.order_code, o.status, o.pickup_location_id, o.customer_name,
            o.shipping_address->>'city' AS city, o.shipping_address->>'state' AS state, o.confirmed_at,
            s.courier_name, s.awb_code, s.label_key, s.pickup_scheduled_for
       FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
      WHERE o.status = $1::order_status AND ($2::uuid[] IS NULL OR o.pickup_location_id = ANY($2::uuid[]))
      ORDER BY o.confirmed_at NULLS LAST, o.id
      LIMIT $3`,
    [status, locationIds, limit],
  );
  return rows;
}

export async function countAwaitingPacking(db: Queryable, locationIds: string[] | null): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM orders
      WHERE status = 'AWAITING_PACKING' AND ($1::uuid[] IS NULL OR pickup_location_id = ANY($1::uuid[]))`,
    [locationIds],
  );
  return rows[0]!.n;
}

export interface DeskItemRow {
  order_id: string;
  order_item_id: string;
  title: string;
  sku: string;
  net_weight_g: number;
  quantity: number;
  batch_code: string | null;
  allocated: number | null;
}

/** Items + the batches the jars were allocated from (COMMITTED allocations, FIFO order). */
export async function listDeskItems(db: Queryable, orderIds: string[]): Promise<DeskItemRow[]> {
  if (orderIds.length === 0) return [];
  const { rows } = await db.query<DeskItemRow>(
    `SELECT oi.order_id, oi.id AS order_item_id, oi.title, oi.sku, oi.net_weight_g, oi.quantity,
            b.batch_code, a.quantity AS allocated
       FROM order_items oi
       LEFT JOIN order_item_allocations a ON a.order_item_id = oi.id AND a.status = 'COMMITTED'
       LEFT JOIN inventory_batches b ON b.id = a.batch_id
      WHERE oi.order_id = ANY($1::uuid[])
      ORDER BY oi.order_id, oi.product_id, b.expiry_date NULLS LAST, b.batch_code`,
    [orderIds],
  );
  return rows;
}

/** Label keys for a set of order codes, with their kitchen (scope check in the service). */
export async function findLabelKeys(db: Queryable, orderCodes: string[]) {
  const { rows } = await db.query<{
    order_id: string;
    order_code: string;
    pickup_location_id: string;
    label_key: string | null;
  }>(
    `SELECT o.id AS order_id, o.order_code, o.pickup_location_id, s.label_key
       FROM orders o LEFT JOIN shipments s ON s.order_id = o.id
      WHERE o.order_code = ANY($1::text[])`,
    [orderCodes],
  );
  return rows;
}

export interface ManifestRow {
  manifest_key: string;
  pickup_date: string;
  kitchen_code: string;
  order_codes: string[];
}

/** Latest pickup manifests (one per pickup batch) for the partner's kitchens. */
export async function listManifests(db: Queryable, locationIds: string[] | null, limit = 10): Promise<ManifestRow[]> {
  const { rows } = await db.query<ManifestRow>(
    `SELECT s.manifest_key, to_char(max(s.pickup_scheduled_for), 'YYYY-MM-DD') AS pickup_date,
            min(pl.code) AS kitchen_code, array_agg(o.order_code ORDER BY o.order_code) AS order_codes
       FROM shipments s JOIN orders o ON o.id = s.order_id JOIN pickup_locations pl ON pl.id = o.pickup_location_id
      WHERE s.manifest_key IS NOT NULL AND ($1::uuid[] IS NULL OR o.pickup_location_id = ANY($1::uuid[]))
      GROUP BY s.manifest_key
      ORDER BY max(s.pickup_requested_at) DESC NULLS LAST
      LIMIT $2`,
    [locationIds, limit],
  );
  return rows;
}
