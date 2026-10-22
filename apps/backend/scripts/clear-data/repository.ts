import { z } from 'zod';
import type { Queryable } from '../../src/config/db';

/**
 * SQL for `pnpm db:clear:data` (local dev/test only). Every statement is a fixed string; the only
 * variable inputs are passed as $n parameters. Table/trigger names below are constants.
 */

/** Order-era tables that only hang off orders/settlements. TRUNCATEd together WITHOUT CASCADE, so
 * PostgreSQL itself refuses if any table outside this list (users, settings, …) references them. */
export const ORDER_LEAF_TABLES = [
  'tracking_events',
  'shipments',
  'order_item_allocations',
  'order_items',
  'order_status_logs',
  'refunds',
  'payments',
  'notifications_log',
  'settlement_items',
  'settlements',
  'expenses',
  'webhook_events',
  'invoice_sequences',
] as const;

/** --with-catalog adds these (and orders/inventory_movements) to the same TRUNCATE. */
export const CATALOG_TABLES = [
  'demo_catalog_products',
  'inventory_movements',
  'inventory_batches',
  'products',
] as const;

/** Audit rows describing data that is KEPT (staff/security, kitchens, settings, catalog). Everything else goes. */
export const AUDIT_KEEP_ENTITY_TYPES = ['user', 'refresh_token_family', 'setting', 'pickup_location'] as const;
export const AUDIT_CATALOG_ENTITY_TYPES = ['product', 'inventory_batch'] as const;

const CountRow = z.object({ label: z.string(), n: z.coerce.number().int() });

export function auditKeepTypes(withCatalog: boolean): string[] {
  return withCatalog ? [...AUDIT_KEEP_ENTITY_TYPES] : [...AUDIT_KEEP_ENTITY_TYPES, ...AUDIT_CATALOG_ENTITY_TYPES];
}

const AUDIT_DELETE_WHERE = `entity_type <> ALL($1::text[])
  OR actor_id IN (SELECT id FROM users WHERE role = 'CUSTOMER')
  OR (entity_type = 'user' AND entity_id IN (SELECT id::text FROM users WHERE role = 'CUSTOMER'))`;

/** Rows that the clear will delete, per table (plus a few "kept" counts for the operator). */
export async function countTargets(db: Queryable, withCatalog: boolean) {
  const { rows } = await db.query(
    `SELECT 'orders' AS label, COUNT(*) AS n FROM orders
     UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
     UNION ALL SELECT 'order_item_allocations', COUNT(*) FROM order_item_allocations
     UNION ALL SELECT 'order_status_logs', COUNT(*) FROM order_status_logs
     UNION ALL SELECT 'payments', COUNT(*) FROM payments
     UNION ALL SELECT 'refunds', COUNT(*) FROM refunds
     UNION ALL SELECT 'shipments', COUNT(*) FROM shipments
     UNION ALL SELECT 'tracking_events', COUNT(*) FROM tracking_events
     UNION ALL SELECT 'notifications_log', COUNT(*) FROM notifications_log
     UNION ALL SELECT 'webhook_events', COUNT(*) FROM webhook_events
     UNION ALL SELECT 'invoice_sequences', COUNT(*) FROM invoice_sequences
     UNION ALL SELECT 'settlements', COUNT(*) FROM settlements
     UNION ALL SELECT 'settlement_items', COUNT(*) FROM settlement_items
     UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
     UNION ALL SELECT 'customers (users role=CUSTOMER)', COUNT(*) FROM users WHERE role = 'CUSTOMER'
     UNION ALL SELECT 'customer sessions (refresh_tokens)', COUNT(*) FROM refresh_tokens t
                JOIN users u ON u.id = t.user_id WHERE u.role = 'CUSTOMER'
     UNION ALL SELECT 'customer addresses', COUNT(*) FROM addresses a JOIN users u ON u.id = a.user_id
                WHERE u.role = 'CUSTOMER'
     UNION ALL SELECT 'customer push_subscriptions', COUNT(*) FROM push_subscriptions p
                JOIN users u ON u.id = p.user_id WHERE u.role = 'CUSTOMER'
     UNION ALL SELECT 'admin_audit_log', COUNT(*) FROM admin_audit_log WHERE ${AUDIT_DELETE_WHERE}
     UNION ALL SELECT 'inventory_movements', COUNT(*) FROM inventory_movements
                WHERE $2::boolean OR order_id IS NOT NULL
     UNION ALL SELECT 'inventory_batches', CASE WHEN $2::boolean THEN COUNT(*) ELSE 0 END FROM inventory_batches
     UNION ALL SELECT 'products', CASE WHEN $2::boolean THEN COUNT(*) ELSE 0 END FROM products
     UNION ALL SELECT 'demo_catalog_products', CASE WHEN $2::boolean THEN COUNT(*) ELSE 0 END
                FROM demo_catalog_products`,
    [auditKeepTypes(withCatalog), withCatalog],
  );
  return Object.fromEntries(rows.map((r) => CountRow.parse(r)).map((r) => [r.label, r.n])) as Record<string, number>;
}

/** What is kept (shown before and checked after). */
export async function countKept(db: Queryable) {
  const { rows } = await db.query(
    `SELECT 'staff users' AS label, COUNT(*) AS n FROM users WHERE role <> 'CUSTOMER'
     UNION ALL SELECT 'staff sessions', COUNT(*) FROM refresh_tokens t JOIN users u ON u.id = t.user_id
                WHERE u.role <> 'CUSTOMER'
     UNION ALL SELECT 'kitchens (pickup_locations)', COUNT(*) FROM pickup_locations
     UNION ALL SELECT 'kitchen links', COUNT(*) FROM user_pickup_locations
     UNION ALL SELECT 'settings', COUNT(*) FROM settings
     UNION ALL SELECT 'products', COUNT(*) FROM products
     UNION ALL SELECT 'inventory_batches', COUNT(*) FROM inventory_batches`,
  );
  return Object.fromEntries(rows.map((r) => CountRow.parse(r)).map((r) => [r.label, r.n])) as Record<string, number>;
}

/** Private documents (invoices, labels, manifests, statements, receipts) whose DB rows go away. Files are NOT deleted. */
export async function countPrivateDocs(db: Queryable) {
  const { rows } = await db.query(
    `SELECT 'invoices' AS label, COUNT(*) AS n FROM orders WHERE invoice_key IS NOT NULL
     UNION ALL SELECT 'shipping labels', COUNT(*) FROM shipments WHERE label_key IS NOT NULL
     UNION ALL SELECT 'manifests', COUNT(*) FROM shipments WHERE manifest_key IS NOT NULL
     UNION ALL SELECT 'settlement statements', COUNT(*) FROM settlements WHERE statement_key IS NOT NULL
     UNION ALL SELECT 'expense receipts', COUNT(*) FROM expenses WHERE receipt_key IS NOT NULL`,
  );
  return Object.fromEntries(rows.map((r) => CountRow.parse(r)).map((r) => [r.label, r.n])) as Record<string, number>;
}

/** Blocks the API/worker from writing orders or stock while the clear runs (released at COMMIT). */
export async function lockForClear(db: Queryable) {
  await db.query("SET LOCAL lock_timeout = '15s'");
  await db.query('LOCK TABLE orders, inventory_batches, inventory_movements, admin_audit_log IN ACCESS EXCLUSIVE MODE');
}

/** admin_audit_log is append-only (row trigger). The trigger is disabled only inside this transaction. */
export async function deleteAudit(db: Queryable, withCatalog: boolean) {
  await db.query('ALTER TABLE admin_audit_log DISABLE TRIGGER trg_audit_append_only');
  const res = await db.query(`DELETE FROM admin_audit_log WHERE ${AUDIT_DELETE_WHERE}`, [auditKeepTypes(withCatalog)]);
  await db.query('ALTER TABLE admin_audit_log ENABLE TRIGGER trg_audit_append_only');
  return res.rowCount ?? 0;
}

export async function truncateOrderData(db: Queryable, withCatalog: boolean) {
  const tables = withCatalog ? [...ORDER_LEAF_TABLES, 'orders', ...CATALOG_TABLES] : [...ORDER_LEAF_TABLES];
  // Constant identifiers only. No CASCADE: PostgreSQL errors if any kept table references these.
  await db.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY`);
}

/**
 * Catalog kept: drop the order-linked RESERVE/RELEASE ledger rows, delete the orders, then set each
 * touched batch's available_stock back to the SUM of its remaining movements (doc 07 invariant).
 * Net effect: reserved AND committed jars of the cleared orders return to stock, exactly as if the
 * orders had never been placed. PRODUCTION / ADJUSTMENT / WASTAGE history is untouched.
 */
export async function deleteOrdersKeepingStock(db: Queryable) {
  const touched = await db.query(
    `SELECT id FROM inventory_batches
      WHERE id IN (SELECT DISTINCT batch_id FROM inventory_movements WHERE order_id IS NOT NULL)
      ORDER BY id FOR UPDATE`,
  );
  const batchIds = touched.rows.map((r) => z.string().parse(r.id));

  await db.query('ALTER TABLE inventory_movements DISABLE TRIGGER trg_movements_append_only');
  const movements = await db.query('DELETE FROM inventory_movements WHERE order_id IS NOT NULL');
  await db.query('ALTER TABLE inventory_movements ENABLE TRIGGER trg_movements_append_only');

  const orders = await db.query('DELETE FROM orders');

  const { rows } = await db.query(
    `WITH ledger AS (
       SELECT b.id, b.available_stock AS before, COALESCE(SUM(m.quantity_delta), 0)::int AS after
         FROM inventory_batches b
         LEFT JOIN inventory_movements m ON m.batch_id = b.id
        WHERE b.id = ANY($1::uuid[])
        GROUP BY b.id
     )
     UPDATE inventory_batches b SET available_stock = l.after
       FROM ledger l
      WHERE b.id = l.id AND b.available_stock <> l.after
     RETURNING l.before, l.after`,
    [batchIds],
  );
  const restored = rows
    .map((r) => z.object({ before: z.number().int(), after: z.number().int() }).parse(r))
    .reduce((sum, r) => sum + (r.after - r.before), 0);
  return {
    orders: orders.rowCount ?? 0,
    movements: movements.rowCount ?? 0,
    batchesAdjusted: rows.length,
    jarsReturned: restored,
  };
}

/** ON DELETE CASCADE removes their refresh_tokens, addresses, push_subscriptions and kitchen links. */
export async function deleteCustomers(db: Queryable) {
  const res = await db.query("DELETE FROM users WHERE role = 'CUSTOMER'");
  return res.rowCount ?? 0;
}

// ── apps/payment (Direct UPI, separate database) ──────────────────────────────────────────────

/** Device enrolment/revocation is credential history for the kept observer devices. */
export const PAYMENT_AUDIT_KEEP_ACTIONS = ['DEVICE_ENROLLED', 'DEVICE_REVOKED'] as const;

export async function countPaymentTargets(db: Queryable) {
  const { rows } = await db.query(
    `SELECT 'upi_orders' AS label, COUNT(*) AS n FROM upi_orders
     UNION ALL SELECT 'upi_payments', COUNT(*) FROM upi_payments
     UNION ALL SELECT 'upi_refunds', COUNT(*) FROM upi_refunds
     UNION ALL SELECT 'upi_credit_alerts', COUNT(*) FROM upi_credit_alerts
     UNION ALL SELECT 'upi_webhook_outbox', COUNT(*) FROM upi_webhook_outbox
     UNION ALL SELECT 'upi_admin_audit', COUNT(*) FROM upi_admin_audit WHERE action <> ALL($1::text[])`,
    [[...PAYMENT_AUDIT_KEEP_ACTIONS]],
  );
  return Object.fromEntries(rows.map((r) => CountRow.parse(r)).map((r) => [r.label, r.n])) as Record<string, number>;
}

export async function clearPaymentTables(db: Queryable) {
  await db.query("SET LOCAL lock_timeout = '15s'");
  await db.query(
    'TRUNCATE TABLE upi_refunds, upi_payments, upi_credit_alerts, upi_orders, upi_webhook_outbox RESTART IDENTITY',
  );
  await db.query('DELETE FROM upi_admin_audit WHERE action <> ALL($1::text[])', [[...PAYMENT_AUDIT_KEEP_ACTIONS]]);
}
