import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { MockPaymentGateway } from '../../src/integrations/razorpay/mock';
import type { ShiprocketApi } from '../../src/integrations/shiprocket/client';
import type { ShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { createLocalPrivateStorage } from '../../src/integrations/storage/private';
import { as, catalogActors, cookieHeader } from '../helpers/catalog';
import { orderRow } from '../helpers/checkout';
import { confirmedOrder, markPacked, registerPickupName, shipmentRow, workerServices } from '../helpers/logistics';
import { staffLogin } from '../helpers/session';
import { startShiprocketSandbox, TEST_COURIER_TOKEN } from '../helpers/shiprocket';
import { buildTestApp, fromBrowser, recordingJobs, testGateway, TEST_API_URL } from '../helpers/test-app';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * Phase 9 §9.7–9.10: settlement cycle (exact paise vs a hand calculation), lifecycle + immutability,
 * partner view, expenses + receipts, staff, settings, GST export.
 */
let t: TestDb;
let redis: Redis;
let app: FastifyInstance;
let gateway: MockPaymentGateway;
let sandbox: ShiprocketSandbox;
let shiprocket: ShiprocketApi;
let closeSandbox: () => Promise<void>;
let actors: Awaited<ReturnType<typeof catalogActors>>;
const jobs = recordingJobs();
const privateStorage = createLocalPrivateStorage({
  dir: join(tmpdir(), `pk-test-settle-${randomBytes(4).toString('hex')}`),
  apiBaseUrl: TEST_API_URL,
  secret: 'test-settle-secret',
});
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() + 5.5 * 3600_000 - 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  t = await createTestDb();
  redis = new Redis(inject('redisUrl'));
  gateway = testGateway(redis);
  const sb = await startShiprocketSandbox(redis);
  sandbox = sb.sandbox;
  shiprocket = sb.client;
  closeSandbox = sb.close;
  app = await buildTestApp({ db: t.db, redis }, { gateway, jobs, privateStorage, shiprocket });
  actors = await catalogActors(app, t.db);
  await registerPickupName(t.db, actors.kitchenA.id);
});
afterAll(async () => {
  await app.close();
  await closeSandbox();
  await redis.quit();
  await t.destroy();
});

const svc = (now?: () => Date) => workerServices({ db: t.db, redis, gateway, jobs, shiprocket, privateStorage, now });
const admin = () => as(app, actors.adminJar);
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}, jar = actors.adminJar) =>
  app.inject({ method, url, headers: fromBrowser({ cookie: cookieHeader(jar) }), payload: payload as object });

/** Book → label → pack → pickup → scans → DELIVERED (real courier webhook route). */
async function deliver(orderId: string) {
  await svc().logistics.bookShipment(orderId);
  await svc().logistics.fetchAndStoreLabel(orderId);
  await markPacked(t.db, orderId);
  await svc(() => new Date(Date.now() + 3 * 86_400_000)).logistics.pickupBatch();
  const awb = (await shipmentRow(t.db, orderId))!.awb_code as string;
  for (const status of ['PICKED UP', 'DELIVERED']) {
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/courier-tracking',
      headers: { 'content-type': 'application/json', 'x-api-key': TEST_COURIER_TOKEN },
      payload: JSON.stringify(sandbox.scan(awb, status)),
    });
  }
}

describe('settlement cycle (settlement.calc, D-41)', () => {
  let settlementId = '';
  let expenseId = '';
  let a: Awaited<ReturnType<typeof confirmedOrder>>;

  it('fixture → DRAFT totals match the hand calculation to the paisa', async () => {
    // Order A: 1 × ₹449 jar, batch cost ₹120/jar, delivered
    a = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await t.db.query('UPDATE inventory_batches SET total_cost_paise = 120000 WHERE id = $1', [a.batchId]); // 10 jars → 12 000/jar
    await deliver(a.orderId);
    expect((await orderRow(t.db, a.orderCode)).status).toBe('DELIVERED');
    // Order B: cancelled right after payment, full refund pending — jar back on the shelf
    const b = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await send('POST', `/api/v1/admin/orders/${b.orderCode}/cancel`, { reason: 'customer called', refund: true });
    // Expense paid by the partner: ₹50.01 ads
    const exp = await send('POST', '/api/v1/admin/expenses', {
      category: 'ADS',
      amountPaise: 5_001,
      incurredOn: today,
      description: 'Instagram boost',
      paidById: actors.partner.id,
    });
    expect(exp.statusCode).toBe(201);
    expenseId = exp.json().data.id;

    const res = await send('POST', '/api/v1/admin/settlements', { periodStart: today, periodEnd: today });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    settlementId = d.settlement.id;
    // Hand calculation (₹449 incl. 5 % GST, mock fee 2 % + 18 % GST):
    //  tax = 2 138 → revenue ex-GST 42 762; fee 898 + 162 = 1 060
    //  A: 42 762 − 12 000 raw − 3 200 packaging − 6 250 freight − 1 060 fee = 20 252
    //  B: revenue 0 (fully refunded), nothing packed / shipped, fee 1 060 lost  = −1 060
    //  Σ 19 192 − 5 001 expenses = 14 191 → partner floor(7 095.5) = 7 095, admin 7 096
    //  payout = 12 000 raw + 7 095 + 5 001 reimbursement = 24 096
    const byCode = Object.fromEntries(d.items.map((i: { orderCode: string; netPaise: number }) => [i.orderCode, i]));
    expect(byCode[a.orderCode]).toMatchObject({
      revenueExGstPaise: 42_762,
      rawCostPaise: 12_000,
      packagingCostPaise: 3_200,
      freightPaise: 6_250,
      gatewayFeePaise: 1_060,
      refundsPaise: 0,
      netPaise: 20_252,
    });
    expect(byCode[b.orderCode]).toMatchObject({
      revenueExGstPaise: 0,
      rawCostPaise: 0,
      packagingCostPaise: 0,
      freightPaise: 0,
      gatewayFeePaise: 1_060,
      refundsPaise: 44_900,
      netPaise: -1_060,
    });
    expect(d.settlement).toMatchObject({
      status: 'DRAFT',
      ordersCount: 2,
      sharedExpensesPaise: 5_001,
      netProfitPaise: 14_191,
      partnerSharePaise: 7_095,
      adminSharePaise: 7_096,
      expenseReimbursementPaise: 5_001,
      partnerPayoutPaise: 24_096,
      warningsCount: 0,
    });
    expect(d.expenses.map((e: { id: string; locked: boolean }) => [e.id, e.locked])).toEqual([[expenseId, true]]);
    expect(d.canFinalize).toBe(true);
  });

  it('an order can be in only one settlement (UNIQUE) and the exact period twice → 409', async () => {
    expect((await send('POST', '/api/v1/admin/settlements', { periodStart: today, periodEnd: today })).statusCode).toBe(
      409,
    );
    const overlap = await send('POST', '/api/v1/admin/settlements', { periodStart: yesterday, periodEnd: today });
    expect(overlap.statusCode).toBe(422); // nothing left: both orders + the expense already belong to the draft
    await expect(
      t.db.query(
        `INSERT INTO settlement_items (settlement_id, order_id, closed_at, jars, revenue_ex_gst_paise, raw_cost_paise,
           packaging_cost_paise, freight_paise, gateway_fee_paise, refunds_paise, rto_freight_paise, net_paise)
         VALUES ($1, $2, NOW(), 1, 0, 0, 0, 0, 0, 0, 0, 0)`,
        [settlementId, a.orderId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('partner never sees a DRAFT; finalize → statement PDF + partner notified; FINALIZED is immutable', async () => {
    expect((await as(app, actors.partnerJar).get('/api/v1/partner/settlements')).json().data.settlements).toEqual([]);
    expect((await as(app, actors.partnerJar).get(`/api/v1/partner/settlements/${settlementId}`)).statusCode).toBe(404);

    jobs.clear();
    const fin = await send('POST', `/api/v1/admin/settlements/${settlementId}/finalize`);
    expect(fin.statusCode).toBe(200);
    expect(fin.json().data).toMatchObject({ settlement: { status: 'FINALIZED' }, statementAvailable: true });
    expect(jobs.jobs).toContainEqual(
      expect.objectContaining({
        name: 'WHATSAPP_SEND',
        data: expect.objectContaining({ template: 'settlement_ready', userId: actors.partner.id }),
      }),
    );
    const url = new URL((await admin().get(`/api/v1/admin/settlements/${settlementId}/statement`)).json().data.url);
    const pdf = await app.inject({ method: 'GET', url: `${url.pathname}${url.search}` });
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    expect((await send('POST', `/api/v1/admin/settlements/${settlementId}/finalize`)).statusCode).toBe(409);
    expect((await send('DELETE', `/api/v1/admin/settlements/${settlementId}`)).statusCode).toBe(409);
    expect((await send('PATCH', `/api/v1/admin/expenses/${expenseId}`, { amountPaise: 1 })).statusCode).toBe(409);
    expect((await send('DELETE', `/api/v1/admin/expenses/${expenseId}`)).statusCode).toBe(409);
    // DB-level money invariant: shares must add up to the net profit
    await expect(
      t.db.query(
        'UPDATE settlements SET partner_share_paise = partner_share_paise + 1, partner_payout_paise = partner_payout_paise + 1 WHERE id = $1',
        [settlementId],
      ),
    ).rejects.toMatchObject({ code: '23514', constraint: 'settlements_split_math' });
  });

  it('partner: list + detail + statement, acknowledge exactly once; admin marks paid', async () => {
    const list = (await as(app, actors.partnerJar).get('/api/v1/partner/settlements')).json().data.settlements;
    expect(list.map((s: { id: string }) => s.id)).toEqual([settlementId]);
    expect(
      (await as(app, actors.partnerJar).get(`/api/v1/partner/settlements/${settlementId}`)).json().data.items,
    ).toHaveLength(2);
    expect(
      (await as(app, actors.partnerJar).get(`/api/v1/partner/settlements/${settlementId}/statement`)).statusCode,
    ).toBe(200);
    const ack = await send('POST', `/api/v1/partner/settlements/${settlementId}/acknowledge`, {}, actors.partnerJar);
    expect(ack.json().data.settlement.partnerAcknowledgedAt).not.toBeNull();
    expect(
      (await send('POST', `/api/v1/partner/settlements/${settlementId}/acknowledge`, {}, actors.partnerJar)).statusCode,
    ).toBe(409);
    // Partner can't generate / pay
    expect(
      (await send('POST', '/api/v1/admin/settlements', { periodStart: today, periodEnd: today }, actors.partnerJar))
        .statusCode,
    ).toBe(403);

    const paid = await send('POST', `/api/v1/admin/settlements/${settlementId}/mark-paid`, {
      bankReference: 'UTR2026101200001',
      paidAt: new Date().toISOString(),
    });
    expect(paid.json().data.settlement).toMatchObject({ status: 'PAID', bankReference: 'UTR2026101200001' });
    expect(
      (
        await send('POST', `/api/v1/admin/settlements/${settlementId}/mark-paid`, {
          bankReference: 'UTR2',
          paidAt: new Date().toISOString(),
        })
      ).statusCode,
    ).toBe(409);
  });

  it('missing freight → DRAFT with a warning, finalize blocked; deleting the draft frees its orders', async () => {
    const c = await confirmedOrder(app, t.db, gateway, actors.kitchenA.id);
    await deliver(c.orderId);
    await t.db.query('UPDATE shipments SET freight_paise = NULL WHERE order_id = $1', [c.orderId]);
    const res = await send('POST', '/api/v1/admin/settlements', { periodStart: yesterday, periodEnd: today });
    expect(res.statusCode).toBe(201);
    const d = res.json().data;
    expect(d.items.map((i: { orderCode: string }) => i.orderCode)).toEqual([c.orderCode]);
    expect(d.warnings).toEqual([{ orderCode: c.orderCode, issue: 'MISSING_FREIGHT' }]);
    expect(d.canFinalize).toBe(false);
    const fin = await send('POST', `/api/v1/admin/settlements/${d.settlement.id}/finalize`);
    expect(fin.statusCode).toBe(422);
    expect((await send('DELETE', `/api/v1/admin/settlements/${d.settlement.id}`)).statusCode).toBe(200);
    const again = await t.db.query(
      'SELECT count(*)::int AS n FROM settlement_items si JOIN orders o ON o.id = si.order_id WHERE o.id = $1',
      [c.orderId],
    );
    expect(again.rows[0]!.n).toBe(0);
  });
});

describe('expenses + receipts (§9.8)', () => {
  it('CRUD, staff-only paid-by, receipt presigned upload → private signed link', async () => {
    const bad = await send('POST', '/api/v1/admin/expenses', {
      category: 'ADS',
      amountPaise: 100,
      incurredOn: today,
      description: 'x',
      paidById: null,
    });
    expect(bad.statusCode).toBe(400);
    const created = (
      await send('POST', '/api/v1/admin/expenses', {
        category: 'SOFTWARE',
        amountPaise: 99_900,
        incurredOn: today,
        description: 'Domain + email',
      })
    ).json().data;
    expect(created).toMatchObject({
      category: 'SOFTWARE',
      amountPaise: 99_900,
      locked: false,
      paidBy: null,
      receiptAvailable: false,
    });
    const upd = await send('PATCH', `/api/v1/admin/expenses/${created.id}`, { amountPaise: 89_900 });
    expect(upd.json().data.amountPaise).toBe(89_900);

    const up = (
      await send('POST', `/api/v1/admin/expenses/${created.id}/receipt-upload`, {
        contentType: 'application/pdf',
        sizeBytes: 9,
      })
    ).json().data;
    const putUrl = new URL(up.uploadUrl);
    const put = await app.inject({
      method: 'PUT',
      url: `${putUrl.pathname}${putUrl.search}`,
      headers: fromBrowser({ 'content-type': 'application/pdf' }),
      payload: Buffer.from('%PDF-1.7\n'),
    });
    expect(put.statusCode).toBe(200);
    expect(
      (await send('PATCH', `/api/v1/admin/expenses/${created.id}`, { receiptKey: up.key })).json().data
        .receiptAvailable,
    ).toBe(true);
    const link = new URL((await admin().get(`/api/v1/admin/expenses/${created.id}/receipt`)).json().data.url);
    expect((await app.inject({ method: 'GET', url: `${link.pathname}${link.search}` })).rawPayload.toString()).toBe(
      '%PDF-1.7\n',
    );
    expect(
      (await send('PATCH', `/api/v1/admin/expenses/${created.id}`, { receiptKey: 'receipts/other/x.pdf' })).statusCode,
    ).toBe(400);

    const list = (await admin().get(`/api/v1/admin/expenses?from=${today}&to=${today}&category=SOFTWARE`)).json().data;
    expect(list.expenses.map((e: { id: string }) => e.id)).toContain(created.id);
    expect((await send('DELETE', `/api/v1/admin/expenses/${created.id}`)).statusCode).toBe(200);
  });
});

describe('staff + settings (§9.7)', () => {
  it('create partner with a kitchen → can log in; deactivate → login refused + sessions revoked', async () => {
    const res = await send('POST', '/api/v1/admin/staff', {
      email: `partner-${randomBytes(3).toString('hex')}@pahadikhatki.test`,
      fullName: 'Second Partner',
      role: 'KITCHEN_PARTNER',
      password: 'temporary-pass-123',
      pickupLocationIds: [actors.kitchenB.id],
    });
    expect(res.statusCode).toBe(201);
    const staff = res.json().data;
    expect(staff).toMatchObject({ role: 'KITCHEN_PARTNER', isActive: true, pickupLocationIds: [actors.kitchenB.id] });
    const login = await staffLogin(app, staff.email, 'temporary-pass-123');
    expect(login.res.statusCode).toBe(200);
    const dup = await send('POST', '/api/v1/admin/staff', {
      email: staff.email,
      fullName: 'Someone Else',
      role: 'KITCHEN_PARTNER',
      password: 'temporary-pass-123',
    });
    expect(dup.statusCode).toBe(409);

    const off = await send('PATCH', `/api/v1/admin/staff/${staff.id}`, { isActive: false });
    expect(off.json().data.isActive).toBe(false);
    expect((await staffLogin(app, staff.email, 'temporary-pass-123')).res.statusCode).toBe(401);
    const revoked = await t.db.query(
      'SELECT count(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [staff.id],
    );
    expect(revoked.rows[0]!.n).toBe(0);
    expect((await send('PATCH', `/api/v1/admin/staff/${actors.admin.id}`, { isActive: false })).statusCode).toBe(400);
  });

  it('settings PATCH validates per key, rejects read-only keys, is audited and takes effect', async () => {
    expect(
      (await send('PATCH', '/api/v1/admin/settings', { key: 'pickup_cutoff_hour_ist', value: 30 })).statusCode,
    ).toBe(400);
    expect((await send('PATCH', '/api/v1/admin/settings', { key: 'cod_enabled', value: true })).statusCode).toBe(400);
    expect((await send('PATCH', '/api/v1/admin/settings', { key: 'not_a_key', value: 1 })).statusCode).toBe(400);
    const ok = await send('PATCH', '/api/v1/admin/settings', { key: 'flat_shipping_fee_paise', value: 4_900 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().data.settings.find((s: { key: string }) => s.key === 'flat_shipping_fee_paise')).toMatchObject({
      value: 4_900,
      editable: true,
    });
    await send('PATCH', '/api/v1/admin/settings', { key: 'flat_shipping_fee_paise', value: null });
    const audits = await t.db.query(
      "SELECT before, after FROM admin_audit_log WHERE action = 'SETTING_UPDATE' AND entity_id = 'flat_shipping_fee_paise' ORDER BY id",
    );
    expect(audits.rows.map((r) => [r.before.value, r.after.value])).toEqual([
      [null, 4_900],
      [4_900, null],
    ]);
  });
});

describe('exports (§9.10)', () => {
  it('GST summary totals = orders table totals for the same period; CSV is attachment + formula-safe', async () => {
    const res = await admin().get(`/api/v1/admin/exports/gst?from=${today}&to=${today}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="pahadi-khatki-gst-/);
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe('month,hsn,gst_rate_percent,orders,quantity,taxable_value,gst,invoice_value');
    const sum = (idx: number) => lines.slice(1).reduce((s, l) => s + Math.round(Number(l.split(',')[idx]) * 100), 0);
    const { rows } = await t.db.query(
      `SELECT COALESCE(sum(subtotal_paise), 0)::bigint AS gross, COALESCE(sum(tax_paise), 0)::bigint AS tax FROM orders
        WHERE confirmed_at IS NOT NULL AND status NOT IN ('PENDING_PAYMENT', 'EXPIRED')
          AND (confirmed_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date`,
      [today],
    );
    expect(sum(7)).toBe(rows[0]!.gross);
    expect(sum(6)).toBe(rows[0]!.tax);

    for (const type of ['orders', 'inventory-ledger', 'customers']) {
      const r = await admin().get(`/api/v1/admin/exports/${type}?from=${today}&to=${today}`);
      expect(r.statusCode, type).toBe(200);
      expect(r.body.split('\r\n').length, type).toBeGreaterThan(2);
    }
    const audit = await t.db.query(
      "SELECT after FROM admin_audit_log WHERE action = 'EXPORT' AND entity_id = 'customers' ORDER BY id DESC LIMIT 1",
    );
    expect(audit.rows[0]!.after).toMatchObject({ pii: true });
  });
});
