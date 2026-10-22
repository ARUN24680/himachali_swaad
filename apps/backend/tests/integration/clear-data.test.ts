import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { clearDatabase, clearPaymentDatabase, clearRedisKeys } from '../../scripts/clear-data/service';
import { runDemoCatalog } from '../../scripts/demo-catalog/service';
import { createDb, type Db } from '../../src/config/db';
import { findLedgerMismatches } from '../../src/modules/inventory/inventory.repository';
import { catalogActors } from '../helpers/catalog';
import { batchStock, liveProduct, orderRow, placeOrder } from '../helpers/checkout';
import { createUser } from '../helpers/factories';
import { confirmedOrder } from '../helpers/logistics';
import { buildTestApp, testGateway } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';
import { silentLogger } from '../helpers/test-logger';

let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: ReturnType<typeof testGateway>;
let actors: Awaited<ReturnType<typeof catalogActors>>;

beforeEach(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  await redis.flushdb();
  gateway = testGateway(redis);
  app = await buildTestApp({ db: t.db, redis }, { gateway });
  actors = await catalogActors(app, t.db);
  await t.db.query("UPDATE users SET totp_secret_enc = 'v1:iv:tag:ciphertext' WHERE id = $1", [actors.admin.id]);
});
afterEach(async () => {
  await app?.close();
  await redis?.quit();
  await t?.destroy();
});

const count = async (db: Db, sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${sql}`, params)).rows[0]!.n);

const snapshot = async (db: Db) => ({
  staff: (await db.query("SELECT * FROM users WHERE role <> 'CUSTOMER' ORDER BY id")).rows,
  settings: (await db.query('SELECT * FROM settings ORDER BY key')).rows,
  kitchens: (await db.query('SELECT * FROM pickup_locations ORDER BY id')).rows,
  links: (await db.query('SELECT * FROM user_pickup_locations ORDER BY user_id, pickup_location_id')).rows,
  staffSessions: (
    await db.query(
      "SELECT t.* FROM refresh_tokens t JOIN users u ON u.id = t.user_id WHERE u.role <> 'CUSTOMER' ORDER BY t.id",
    )
  ).rows,
});

/** Customer + paid order (payment, shipment, tracking, refund, invoice, settlement, notification) + a reserved order. */
async function seedWebsiteData() {
  const customer = await createUser(t.db, { role: 'CUSTOMER' });
  await t.db.query(
    `INSERT INTO addresses (user_id, full_name, phone, line1, city, state, pincode, is_default)
     VALUES ($1, 'Asha', '+919876500000', 'Mall Road', 'Kullu', 'Himachal Pradesh', '175101', TRUE)`,
    [customer.id],
  );
  await t.db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
     VALUES ($1, gen_random_uuid(), $2, NOW() + INTERVAL '1 day')`,
    [customer.id, randomBytes(32).toString('hex')],
  );
  await t.db.query(
    "INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, 'https://push.test/c', 'k', 'a')",
    [customer.id],
  );

  const paid = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id, 2);
  await t.db.query("UPDATE orders SET user_id = $2, invoice_key = 'invoices/x.pdf' WHERE id = $1", [
    paid.orderId,
    customer.id,
  ]);
  const shipment = await t.db.query<{ id: string }>(
    "INSERT INTO shipments (order_id, awb_code, label_key) VALUES ($1, 'AWB1', 'labels/x.pdf') RETURNING id",
    [paid.orderId],
  );
  await t.db.query(
    "INSERT INTO tracking_events (shipment_id, status_text, event_time, source) VALUES ($1, 'Picked up', NOW(), 'POLL')",
    [shipment.rows[0]!.id],
  );
  const payment = await t.db.query<{ id: string }>('SELECT id FROM payments WHERE order_id = $1', [paid.orderId]);
  await t.db.query(
    `INSERT INTO refunds (order_id, payment_id, idempotency_key, amount_paise, reason, initiated_by_type)
     VALUES ($1, $2, $3, 100, 'DAMAGED', 'ADMIN')`,
    [paid.orderId, payment.rows[0]!.id, `refund:${paid.orderId}:DAMAGED`],
  );
  await t.db.query("INSERT INTO invoice_sequences (financial_year, last_number) VALUES ('2026-27', 7)");
  const settlement = await t.db.query<{ id: string }>(
    "INSERT INTO settlements (period_start, period_end) VALUES ('2026-10-01', '2026-10-15') RETURNING id",
  );
  await t.db.query(
    `INSERT INTO settlement_items (settlement_id, order_id, closed_at, jars, revenue_ex_gst_paise, raw_cost_paise,
       packaging_cost_paise, freight_paise, gateway_fee_paise, refunds_paise, rto_freight_paise, net_paise)
     VALUES ($1, $2, NOW(), 2, 0, 0, 0, 0, 0, 0, 0, 0)`,
    [settlement.rows[0]!.id, paid.orderId],
  );
  await t.db.query(
    `INSERT INTO expenses (category, amount_paise, incurred_on, description, settlement_id, paid_by_id)
     VALUES ('ADS', 5000, CURRENT_DATE, 'Ads', $1, $2)`,
    [settlement.rows[0]!.id, actors.partner.id],
  );
  await t.db.query(
    "INSERT INTO notifications_log (order_id, user_id, channel, recipient, template) VALUES ($1, $2, 'SMS', 'x', 'order_confirmed')",
    [paid.orderId, customer.id],
  );
  await t.db.query(
    "INSERT INTO webhook_events (provider, event_id, event_type, payload) VALUES ('RAZORPAY', $1, 'payment.captured', '{}')",
    [randomUUID()],
  );
  // Audit: order activity + customer-actor rows go; staff/settings/catalog history stays.
  const audit = (actor: string | null, action: string, type: string, id: string) =>
    t.db.query('INSERT INTO admin_audit_log (actor_id, action, entity_type, entity_id) VALUES ($1, $2, $3, $4)', [
      actor,
      action,
      type,
      id,
    ]);
  await audit(actors.admin.id, 'ORDER_CANCEL', 'order', paid.orderId);
  await audit(customer.id, 'TOKEN_REUSE_DETECTED', 'refresh_token_family', randomUUID());
  await audit(actors.admin.id, 'SETTING_UPDATE', 'setting', 'low_stock_threshold');
  await audit(actors.admin.id, 'PRODUCT_CREATE', 'product', paid.productId);

  // A second order still holding a reservation (PENDING_PAYMENT, allocations RESERVED).
  const reserved = await liveProduct(t.db, actors.kitchenA.id, { stock: 5 });
  const co = (await placeOrder(app, [{ productId: reserved.id, quantity: 3 }])).json().data;
  expect((await orderRow(t.db, co.orderCode)).status).toBe('PENDING_PAYMENT');

  expect(await batchStock(t.db, paid.batchId)).toBe(8);
  expect(await batchStock(t.db, reserved.batchId!)).toBe(2);
  return { customer, paid, reserved };
}

describe('pnpm db:clear:data', () => {
  it('clears orders, customers and logs; keeps staff credentials, sessions, kitchens, settings and catalog with jars returned', async () => {
    const seeded = await seedWebsiteData();
    await redis.mset(
      'pk:otp:code:+919876500000',
      'x',
      'pk:rl:127.0.0.1',
      '3',
      'pk:svc:quote:175101',
      '{}',
      'pk:admin:dashboard',
      '{}',
      'pk:bull:cron:1',
      'job',
      'pk:shiprocket:token',
      'tok',
      `pk:totp:pending:${actors.admin.id}`,
      'enc',
      'other-app:key',
      'v',
    );
    const before = await snapshot(t.db);
    const productsBefore = await count(t.db, 'products');

    const result = await clearDatabase(t.db, { nodeEnv: 'test', withCatalog: false });
    expect(result.deleted).toMatchObject({
      orders: 2,
      payments: 1,
      shipments: 1,
      'customers (users role=CUSTOMER)': 1,
    });
    expect(result.privateDocs).toMatchObject({ invoices: 1, 'shipping labels': 1 });
    expect(result.stock).toMatchObject({ orders: 2, batchesAdjusted: 2, jarsReturned: 5 });

    // Kept byte-for-byte: staff rows (password hash + TOTP secret), sessions, kitchens, links, settings.
    const after = await snapshot(t.db);
    expect(after).toEqual(before);
    expect(after.staff.find((u) => u.id === actors.admin.id)!.totp_secret_enc).toBe('v1:iv:tag:ciphertext');
    expect(after.staffSessions.length).toBeGreaterThan(0);
    expect(await count(t.db, 'products')).toBe(productsBefore);

    // Stock: reserved and committed jars are back, ledger balanced, PRODUCTION history intact.
    expect(await batchStock(t.db, seeded.paid.batchId)).toBe(10);
    expect(await batchStock(t.db, seeded.reserved.batchId!)).toBe(5);
    expect(await findLedgerMismatches(t.db)).toEqual([]);
    expect(await count(t.db, "inventory_movements WHERE movement_type = 'PRODUCTION'")).toBe(2);

    for (const table of [
      'orders',
      'order_items',
      'order_item_allocations',
      'order_status_logs',
      'payments',
      'refunds',
      'shipments',
      'tracking_events',
      'notifications_log',
      'webhook_events',
      'invoice_sequences',
      'settlements',
      'settlement_items',
      'expenses',
      'addresses',
      "users WHERE role = 'CUSTOMER'",
      'inventory_movements WHERE order_id IS NOT NULL',
    ]) {
      expect(await count(t.db, table), table).toBe(0);
    }
    expect(await count(t.db, 'refresh_tokens WHERE user_id = $1', [seeded.customer.id])).toBe(0);
    expect(await count(t.db, "push_subscriptions WHERE endpoint = 'https://push.test/c'")).toBe(0);
    const audit = (await t.db.query('SELECT entity_type FROM admin_audit_log ORDER BY id')).rows.map(
      (r) => r.entity_type,
    );
    expect(audit).not.toContain('order');
    expect(audit).not.toContain('refresh_token_family');
    expect(audit).toEqual(expect.arrayContaining(['setting', 'product', 'user']));
    // Append-only protection is back on after the clear.
    await expect(t.db.query('DELETE FROM admin_audit_log')).rejects.toThrow(/append-only/);
    await expect(t.db.query('DELETE FROM inventory_movements')).rejects.toThrow(/append-only/);

    // Redis: OTP/rate-limit/cache keys gone; queues, Shiprocket token, TOTP enrolment, non-pk keys kept.
    const r = await clearRedisKeys(redis, 'test');
    expect(r.deleted).toBeGreaterThanOrEqual(4);
    expect(await redis.exists('pk:otp:code:+919876500000', 'pk:rl:127.0.0.1', 'pk:svc:quote:175101')).toBe(0);
    expect(await redis.exists('pk:admin:dashboard')).toBe(0);
    expect(
      await redis.exists(
        'pk:bull:cron:1',
        'pk:shiprocket:token',
        `pk:totp:pending:${actors.admin.id}`,
        'other-app:key',
      ),
    ).toBe(4);

    // Store still works: checkout on the kept catalog succeeds after the clear.
    const again = await placeOrder(app, [{ productId: seeded.reserved.id, quantity: 1 }]);
    expect(again.statusCode).toBe(201);

    // Rerunnable: a second run clears the new order and leaves the ledger balanced.
    const second = await clearDatabase(t.db, { nodeEnv: 'test', withCatalog: false });
    expect(second.deleted.orders).toBe(1);
    expect(await count(t.db, 'orders')).toBe(0);
    expect(await findLedgerMismatches(t.db)).toEqual([]);
  });

  it('--with-catalog also removes products, batches, movements and demo ownership; demo seed works again', async () => {
    await seedWebsiteData();
    await runDemoCatalog(t.db, 'seed', { nodeEnv: 'test', kitchenCode: actors.kitchenA.code });
    const before = await snapshot(t.db);

    const result = await clearDatabase(t.db, { nodeEnv: 'test', withCatalog: true });
    expect(result.stock).toBeNull();
    expect(result.deleted.products).toBe(14);
    for (const table of ['products', 'inventory_batches', 'inventory_movements', 'demo_catalog_products', 'orders']) {
      expect(await count(t.db, table), table).toBe(0);
    }
    expect(await count(t.db, "admin_audit_log WHERE entity_type IN ('product', 'inventory_batch', 'order')")).toBe(0);
    expect(await count(t.db, "admin_audit_log WHERE entity_type = 'setting'")).toBe(1);
    expect(await snapshot(t.db)).toEqual(before);

    const reseed = await runDemoCatalog(t.db, 'seed', { nodeEnv: 'test', kitchenCode: actors.kitchenA.code });
    expect(reseed.created).toBe(12);
    expect(await findLedgerMismatches(t.db)).toEqual([]);
  });

  it('refuses outside development/test and rolls back completely when a kept row references a customer', async () => {
    const seeded = await seedWebsiteData();
    await expect(clearDatabase(t.db, { nodeEnv: 'production', withCatalog: false })).rejects.toThrow(/NODE_ENV/);
    await expect(clearDatabase(t.db, { nodeEnv: undefined, withCatalog: false })).rejects.toThrow(/NODE_ENV/);
    await expect(clearRedisKeys(redis, 'production')).rejects.toThrow(/NODE_ENV/);

    // A kept table (settings) pointing at a customer must never be modified or wiped: abort instead.
    await t.db.query("UPDATE settings SET updated_by = $1 WHERE key = 'low_stock_threshold'", [seeded.customer.id]);
    await expect(clearDatabase(t.db, { nodeEnv: 'test', withCatalog: false })).rejects.toThrow(/rolled back/);
    expect(await count(t.db, 'orders')).toBe(2);
    expect(await count(t.db, 'payments')).toBe(1);
    expect(await count(t.db, "admin_audit_log WHERE entity_type = 'order'")).toBe(1);
    expect(await batchStock(t.db, seeded.paid.batchId)).toBe(8);
    expect(await findLedgerMismatches(t.db)).toEqual([]);
  });

  it('CLI refuses to start when NODE_ENV is production', async () => {
    const run = promisify(execFile);
    const err = await run('node_modules/.bin/tsx', ['scripts/clear-data.ts', '--dry-run'], {
      cwd: new URL('../..', import.meta.url).pathname,
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: t.url },
    }).catch((e: { code: number; stderr: string }) => e);
    expect(err).toMatchObject({ code: 1 });
    expect((err as { stderr: string }).stderr).toMatch(/NODE_ENV must be development or test/);
  });
});

describe('payment database (apps/payment, Direct UPI)', () => {
  let admin: pg.Client;
  let payDb: Db;
  let name: string;

  beforeEach(async () => {
    name = `pk_pay_test_${randomBytes(5).toString('hex')}`;
    admin = new pg.Client({ connectionString: inject('pgAdminUrl') });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(inject('pgAdminUrl'));
    url.pathname = `/${name}`;
    payDb = createDb(
      { connectionString: url.toString(), max: 2, slowQueryMs: 10_000, applicationName: 'pk-test', ssl: false },
      silentLogger(),
    );
    const sql = await readFile(new URL('../../../payment/migrations/0001_init.sql', import.meta.url), 'utf8');
    await payDb.query(sql.split('-- migrate:down')[0]!);
  });
  afterEach(async () => {
    await payDb?.close();
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });

  it('clears UPI orders, alerts, payments, refunds and outbox; keeps observer devices and their audit', async () => {
    await payDb.query(
      `INSERT INTO upi_orders (id, receipt, amount_paise, payable_paise, expires_at, hold_until)
       VALUES ('order_a', 'PK-ABCDEF', 44900, 44899, NOW(), NOW() + INTERVAL '1 hour')`,
    );
    await payDb.query(
      `INSERT INTO upi_credit_alerts (source, external_id, utr, amount_paise, credited_at, status, order_id)
       VALUES ('DEV', 'dev:1', 'UTR1', 44899, NOW(), 'MATCHED', 'order_a')`,
    );
    await payDb.query(
      `INSERT INTO upi_payments (id, order_id, amount_paise, received_paise, utr, alert_id)
       VALUES ('pay_a', 'order_a', 44900, 44899, 'UTR1', 1)`,
    );
    await payDb.query(
      "INSERT INTO upi_refunds (id, payment_id, amount_paise, idempotency_key) VALUES ('rfnd_a', 'pay_a', 100, 'k1')",
    );
    await payDb.query(
      "INSERT INTO upi_webhook_outbox (event_id, event, body) VALUES ('evt_1', 'payment.captured', '{}')",
    );
    await payDb.query("INSERT INTO upi_observer_devices (label, secret_ciphertext) VALUES ('Pixel', 'enc-secret')");
    await payDb.query(
      "INSERT INTO upi_admin_audit (actor, action) VALUES ('arun', 'DEVICE_ENROLLED'), ('arun', 'ALERT_LINKED')",
    );

    await expect(clearPaymentDatabase(payDb, 'production')).rejects.toThrow(/NODE_ENV/);
    const deleted = await clearPaymentDatabase(payDb, 'test');
    expect(deleted).toMatchObject({ upi_orders: 1, upi_payments: 1, upi_refunds: 1, upi_admin_audit: 1 });
    for (const table of ['upi_orders', 'upi_payments', 'upi_refunds', 'upi_credit_alerts', 'upi_webhook_outbox']) {
      expect(await count(payDb, table), table).toBe(0);
    }
    expect((await payDb.query('SELECT secret_ciphertext FROM upi_observer_devices')).rows).toEqual([
      { secret_ciphertext: 'enc-secret' },
    ]);
    expect((await payDb.query('SELECT action FROM upi_admin_audit')).rows).toEqual([{ action: 'DEVICE_ENROLLED' }]);
  });
});
