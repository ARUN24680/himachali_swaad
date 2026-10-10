import type { z } from 'zod';
import type { Queryable } from '../../config/db';
import { findSettingValue } from './settings.repository';

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

    invalidate(key?: string): void {
      if (key) cache.delete(key);
      else cache.clear();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;
