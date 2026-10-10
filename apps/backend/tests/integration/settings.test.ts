import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSettingsService } from '../../src/modules/settings/settings.service';
import { createTestDb, type TestDb } from '../helpers/test-db';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.destroy());

describe('getSetting', () => {
  it('reads and Zod-parses a setting', async () => {
    const settings = createSettingsService();
    await expect(settings.getSetting(t.db, 'reservation_ttl_minutes', z.number().int())).resolves.toBe(15);
  });

  it('caches until TTL expiry or invalidate()', async () => {
    let clock = 0;
    const settings = createSettingsService({ ttlMs: 1_000, now: () => clock });
    const read = () => settings.getSetting(t.db, 'low_stock_threshold', z.number());

    expect(await read()).toBe(20);
    await t.db.query("UPDATE settings SET value = '25' WHERE key = 'low_stock_threshold'");
    expect(await read()).toBe(20); // cached

    settings.invalidate('low_stock_threshold');
    expect(await read()).toBe(25);

    await t.db.query("UPDATE settings SET value = '30' WHERE key = 'low_stock_threshold'");
    clock = 1_001;
    expect(await read()).toBe(30); // TTL expired
  });

  it('fails loudly for an unknown key or a value of the wrong shape', async () => {
    const settings = createSettingsService();
    await expect(settings.getSetting(t.db, 'does_not_exist', z.number())).rejects.toThrow(/Missing setting/);
    await expect(settings.getSetting(t.db, 'cod_enabled', z.number())).rejects.toThrow();
  });
});
