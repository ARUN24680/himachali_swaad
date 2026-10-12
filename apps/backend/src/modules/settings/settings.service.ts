import type { z } from 'zod';
import type { Queryable } from '../../config/db';
import { EDITABLE_SETTING_KEYS } from '@pk/shared';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import { findSettingValue, listSettings, updateSettingValue } from './settings.repository';

/**
 * Runtime business settings (`settings` table). Values are Zod-parsed and cached briefly in memory;
 * call `invalidate(key)` after an update (admin settings, Phase 9).
 */
export function createSettingsService(opts: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = opts.ttlMs ?? 30_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { value: unknown; expiresAt: number }>();

  return {
    async getSetting<S extends z.ZodType>(db: Queryable, key: string, schema: S): Promise<z.infer<S>> {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return schema.parse(hit.value);

      const raw = await findSettingValue(db, key);
      if (raw === undefined) throw new Error(`Missing setting: ${key}`); // config bug → INTERNAL_ERROR + Sentry
      const value = schema.parse(raw);
      cache.set(key, { value, expiresAt: now() + ttlMs });
      return value;
    },

    /** Admin read; `editable` = has a per-key schema (SETTING_SCHEMAS). */
    list: async (db: Queryable) =>
      (await listSettings(db)).map((r) => ({ ...r, editable: (EDITABLE_SETTING_KEYS as string[]).includes(r.key) })),

    /** PATCH /admin/settings (Phase 9 §9.7) — value already validated per key; audited in the same transaction. */
    async update(
      db: { transaction<T>(fn: (c: Queryable) => Promise<T>): Promise<T> },
      key: string,
      value: unknown,
      by: { userId: string; ip: string | null },
    ) {
      await db.transaction(async (client) => {
        const before = await updateSettingValue(client, key, value, by.userId);
        if (before === undefined) throw new AppError('NOT_FOUND', 'Unknown setting.');
        await audit(client, {
          actorId: by.userId,
          action: 'SETTING_UPDATE',
          entityType: 'setting',
          entityId: key,
          before: { value: before },
          after: { value },
          ip: by.ip,
        });
      });
      cache.delete(key);
    },

    invalidate(key?: string): void {
      if (key) cache.delete(key);
      else cache.clear();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
