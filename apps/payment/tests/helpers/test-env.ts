import { pino } from 'pino';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { inject } from 'vitest';
import { buildApp } from '../../src/app';
import { createDb, type Db } from '../../src/config/db';
import { parseEnv, type Env } from '../../src/config/env';
import { createServices } from '../../src/services';

export const silentLogger = () => pino({ level: 'silent' });

export const KEY_ID = 'upi_test_abcdefgh12';
export const KEY_SECRET = 'k'.repeat(40);
export const WEBHOOK_SECRET = 'w'.repeat(40);
export const KEK = randomBytes(32).toString('base64');

export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    PAYMENT_DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    PAYMENT_API_KEY_ID: KEY_ID,
    PAYMENT_API_KEY_SECRET: KEY_SECRET,
    PAYMENT_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PAYMENT_WEBHOOK_URL: 'http://127.0.0.1:9/webhooks/razorpay',
    PAYMENT_STOREFRONT_URL: 'https://shop.example.in',
    UPI_VPA: 'pahadikhatki@hdfcbank',
    UPI_PAYEE_NAME: 'Pahadi Khatki',
    UPI_DEVICE_KEK: KEK,
    UPI_BANK_SMS_SENDERS: 'HDFCBK',
    PAYMENT_DEV_TOOLS: 'true',
    ...overrides,
  });
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: inject('pgAdminUrl') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Clones the migrated template into a fresh database for one test file. */
export async function createTestDb(): Promise<{ db: Db; destroy: () => Promise<void> }> {
  const name = `pk_pay_test_${randomBytes(6).toString('hex')}`;
  await admin((c) => c.query(`CREATE DATABASE ${name} TEMPLATE ${inject('pgTemplateDb')}`));
  const url = new URL(inject('pgAdminUrl'));
  url.pathname = `/${name}`;
  const db = createDb(
    { connectionString: url.toString(), max: 10, ssl: false, applicationName: 'pk-pay-test' },
    silentLogger(),
  );
  return {
    db,
    destroy: async () => {
      await db.close();
      await admin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}

export async function createTestApp(db: Db, env: Env = testEnv(), extra: Partial<Parameters<typeof buildApp>[0]> = {}) {
  const logger = silentLogger();
  const svc = createServices(env, logger, { db });
  const app = await buildApp({
    db,
    logger,
    gateway: svc.gateway,
    checkout: svc.checkout,
    alerts: svc.alerts,
    email: svc.email,
    observer: svc.observer,
    apiKeyId: env.PAYMENT_API_KEY_ID,
    apiKeySecret: env.PAYMENT_API_KEY_SECRET,
    webRoot: '/nonexistent',
    trustProxy: false,
    devTools: env.PAYMENT_DEV_TOOLS,
    ...extra,
  });
  return { app, svc };
}

export const basicAuth = (id = KEY_ID, secret = KEY_SECRET) =>
  `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;

/** Resets all tables between tests (one DB per file). */
export async function truncateAll(db: Db): Promise<void> {
  await db.query(`TRUNCATE upi_admin_audit, upi_webhook_outbox, upi_observer_nonces, upi_refunds, upi_payments,
                  upi_credit_alerts, upi_observer_devices, upi_orders RESTART IDENTITY CASCADE`);
}
