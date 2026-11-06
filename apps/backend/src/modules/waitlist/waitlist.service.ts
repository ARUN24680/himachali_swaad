import { createHmac } from 'node:crypto';
import type { AdminWaitlistResponse, WaitlistEntry, WaitlistJoinResponse, WaitlistSource } from '@pk/shared';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import type { AdminActor } from '../admin/admin.service';
import { toCsv } from '../admin/exports.service';
import { audit } from '../audit/audit.service';
import * as repo from './waitlist.repository';
import type { WaitlistEntryRow } from './waitlist.validation';

export interface WaitlistServiceDeps {
  db: Db;
  logger: Logger;
  /** HMAC key for the stored IP hash (same pepper pattern as the OTP hashes). */
  ipPepper: string;
}

export interface WaitlistJoinInput {
  phone?: string;
  email?: string;
  name?: string;
  source: WaitlistSource;
  consent: true;
}

export interface WaitlistRequestContext {
  ip: string | null;
  userAgent: string | null;
}

const IST = 'Asia/Kolkata';
const istStamp = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(/(\d{2})\/(\d{2})\/(\d{4}), /, '$3-$2-$1 ');

const toEntry = (r: WaitlistEntryRow): WaitlistEntry => ({
  id: r.id,
  phone: r.phone,
  email: r.email,
  name: r.name,
  source: r.source,
  consentAt: r.consent_at.toISOString(),
  createdAt: r.created_at.toISOString(),
});

/**
 * Pre-launch waitlist (audit 2026-11-03, R-5). Public join is a single insert — duplicates are a
 * success for the visitor (`alreadyJoined`), so the endpoint never confirms whether a phone or
 * e-mail is on the list by its status code. Phone / e-mail are never logged.
 */
export function createWaitlistService(deps: WaitlistServiceDeps) {
  const { db } = deps;
  const ipHash = (ip: string | null) => (ip ? createHmac('sha256', deps.ipPepper).update(ip).digest('hex') : null);

  return {
    async join(input: WaitlistJoinInput, ctx: WaitlistRequestContext): Promise<WaitlistJoinResponse> {
      const id = await repo.insertEntry(db, {
        phone: input.phone ?? null,
        email: input.email ?? null,
        name: input.name?.trim() ? input.name.trim() : null,
        source: input.source,
        consentAt: new Date(),
        ipHash: ipHash(ctx.ip),
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      });
      const alreadyJoined = id === null;
      deps.logger.info(
        {
          source: input.source,
          alreadyJoined,
          hasPhone: input.phone !== undefined,
          hasEmail: input.email !== undefined,
        },
        'waitlist join',
      );
      return { joined: true, alreadyJoined };
    },

    async list(p: {
      page: number;
      pageSize: number;
      q?: string;
      source?: WaitlistSource;
    }): Promise<AdminWaitlistResponse> {
      const rows = await repo.listEntries(db, p);
      return { entries: rows.map(toEntry), total: rows[0]?.total ?? 0, page: p.page, pageSize: p.pageSize };
    },

    /** CSV of the whole list (PII) — ADMIN only, every download audited like the other exports. */
    async exportCsv(by: AdminActor): Promise<{ csv: string; filename: string }> {
      const rows = await repo.listAllEntries(db);
      const csv = toCsv(
        ['phone', 'email', 'name', 'source', 'consent_at_ist', 'joined_at_ist'],
        rows.map((r) => [r.phone, r.email, r.name, r.source, istStamp(r.consent_at), istStamp(r.created_at)]),
      );
      await audit(db, {
        actorId: by.auth.userId,
        action: 'EXPORT',
        entityType: 'export',
        entityId: 'waitlist',
        after: { rows: rows.length, pii: true },
        ip: by.ip,
      });
      return { csv, filename: `pahadi-khatki-waitlist-${istStamp(new Date()).slice(0, 10)}.csv` };
    },
  };
}

export type WaitlistService = ReturnType<typeof createWaitlistService>;
