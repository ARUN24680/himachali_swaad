import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { maskPhone, type Role, type SessionUser } from '@pk/shared';
import bcrypt from 'bcryptjs';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db, Queryable } from '../../config/db';
import type { OtpProvider } from '../../integrations/sms/otp-provider';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import * as repo from './auth.repository';
import { hashToken, newRefreshToken, type TokenService } from './auth.tokens';
import { currentTotp, decryptSecret, encryptSecret, newTotpSecret, totpUrl, verifyTotp } from './auth.totp';
import type { UserRow } from './auth.validation';

/** D-21 limits. */
export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_SEND_LIMIT = 3;
export const OTP_SEND_WINDOW_SEC = 10 * 60;
export const OTP_RESEND_AFTER_SEC = 30;
/** D-19 */
export const BCRYPT_COST = 12;
/**
 * Two tabs refreshing at the same moment both present the same token; the loser sees it already
 * rotated. Within this window that is a race, not theft — reject without revoking the family (D-48).
 */
export const REFRESH_RACE_GRACE_MS = 10_000;
const TOTP_PENDING_TTL_SEC = 10 * 60;

// Constant-time path for unknown emails: compare against a real bcrypt hash of a random string.
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), BCRYPT_COST);

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  user: SessionUser;
  pickupLocationIds: string[];
  accessToken: string;
  refreshToken: string;
}

export interface AuthServiceDeps {
  db: Db;
  redis: Redis;
  logger: Logger;
  tokens: TokenService;
  otpProvider: OtpProvider;
  /** HMAC key for OTP hashes in Redis. */
  otpPepper: string;
  /** 32-byte AES key for TOTP secrets at rest. */
  totpKey: Buffer;
  refreshTtlSec: number;
}

const otpKeys = (phone: string) => ({
  code: `pk:otp:code:${phone}`,
  sends: `pk:otp:sends:${phone}`,
  cooldown: `pk:otp:cooldown:${phone}`,
});

const STAFF: readonly Role[] = ['ADMIN', 'KITCHEN_PARTNER'];
const INVALID_LOGIN = 'Invalid email or password';
const INVALID_OTP = 'That code is incorrect or has expired. Request a new one.';

/** Short, non-reversible tag for logging which email failed without storing the email (PII). */
const emailTag = (email: string) => createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 12);

/** Admin "force logout" (Phase 9 staff management): revoke every refresh-token family of a user. */
export const revokeAllSessions = (q: Queryable, userId: string) => repo.revokeAllForUser(q, userId);

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    role: u.role,
    fullName: u.full_name,
    phoneMasked: maskPhone(u.phone),
    email: u.email,
    totpEnabled: u.totp_secret_enc !== null,
  };
}

/** Worker job CLEANUP_REFRESH_TOKENS — no auth deps needed. */
export const cleanupRefreshTokens = (db: Queryable): Promise<number> => repo.deleteExpiredRefreshFamilies(db);

export function createAuthService(deps: AuthServiceDeps) {
  const { db, redis, tokens } = deps;

  const otpHash = (phone: string, code: string) =>
    createHmac('sha256', deps.otpPepper).update(`${phone}:${code}`).digest('hex');

  /** Creates a refresh-token row (new family unless one is given) and signs an access token. */
  async function issueSession(client: Queryable, user: UserRow, ctx: RequestContext, familyId: string = randomUUID()) {
    const refreshToken = newRefreshToken();
    const refreshId = await repo.insertRefreshToken(client, {
      userId: user.id,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + deps.refreshTtlSec * 1000),
      userAgent: ctx.userAgent?.slice(0, 300) ?? null,
      ip: ctx.ip,
    });
    const pickupLocationIds = user.role === 'KITCHEN_PARTNER' ? await repo.listPickupLocationIds(client, user.id) : [];
    const accessToken = await tokens.signAccess({ userId: user.id, role: user.role, pickupLocationIds });
    return { refreshId, session: { user: toSessionUser(user), pickupLocationIds, accessToken, refreshToken } };
  }

  return {
    // ── Customer phone OTP (D-18, D-21) ─────────────────────────────────────
    /** Same response whether or not the phone is registered (no user enumeration). */
    async sendOtp(phone: string): Promise<{ sent: true; resendAfterSec: number }> {
      const keys = otpKeys(phone);

      const cooldownSet = await redis.set(keys.cooldown, '1', 'EX', OTP_RESEND_AFTER_SEC, 'NX');
      if (cooldownSet === null) {
        const ttl = await redis.ttl(keys.cooldown);
        throw new AppError('RATE_LIMITED', 'Please wait before requesting another code.', {
          retryAfterSeconds: Math.max(ttl, 1),
        });
      }

      const sends = await redis.incr(keys.sends);
      if (sends === 1) await redis.expire(keys.sends, OTP_SEND_WINDOW_SEC);
      if (sends > OTP_SEND_LIMIT) {
        const ttl = await redis.ttl(keys.sends);
        throw new AppError('RATE_LIMITED', 'Too many codes requested. Try again later.', {
          retryAfterSeconds: Math.max(ttl, 1),
        });
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await redis
        .multi()
        .hset(keys.code, { hash: otpHash(phone, code), attempts: '0' })
        .expire(keys.code, OTP_TTL_SEC)
        .exec();

      try {
        await deps.otpProvider.send(phone, code);
      } catch (err) {
        await redis.del(keys.code);
        deps.logger.error({ err, provider: deps.otpProvider.name }, 'OTP delivery failed');
        throw new AppError('UPSTREAM_UNAVAILABLE', 'We could not send the code right now. Please try again.');
      }
      return { sent: true, resendAfterSec: OTP_RESEND_AFTER_SEC };
    },

    async verifyOtp(phone: string, otp: string, ctx: RequestContext): Promise<IssuedSession> {
      const key = otpKeys(phone).code;
      const stored = await redis.hget(key, 'hash');
      if (!stored) throw new AppError('OTP_INVALID', INVALID_OTP);

      // Count the attempt before comparing, atomically — parallel guesses cannot exceed the limit
      const attempts = await redis.hincrby(key, 'attempts', 1);
      if (attempts > OTP_MAX_ATTEMPTS) {
        await redis.del(key);
        throw new AppError('OTP_INVALID', INVALID_OTP);
      }

      const matches = timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(otpHash(phone, otp), 'hex'));
      if (!matches) {
        if (attempts >= OTP_MAX_ATTEMPTS) await redis.del(key);
        throw new AppError('OTP_INVALID', INVALID_OTP);
      }
      await redis.del(key);

      return db.transaction(async (client) => {
        const user = await repo.upsertCustomerByPhone(client, phone);
        // Staff or deactivated phone: never log in via OTP. Same message as a wrong code.
        if (!user) throw new AppError('OTP_INVALID', INVALID_OTP);
        return (await issueSession(client, user, ctx)).session;
      });
    },

    // ── Staff login (D-19) ───────────────────────────────────────────────────
    async staffLogin(
      input: { email: string; password: string; totp?: string },
      ctx: RequestContext,
    ): Promise<IssuedSession> {
      const user = await repo.findUserByEmail(db, input.email);
      const passwordOk = await bcrypt.compare(input.password, user?.password_hash ?? DUMMY_HASH);

      const failure = async (reason: string, u: UserRow | null) => {
        await audit(db, {
          actorId: u?.id ?? null,
          action: 'STAFF_LOGIN_FAILED',
          entityType: 'user',
          entityId: u?.id ?? `email:${emailTag(input.email)}`,
          after: { reason },
          ip: ctx.ip,
        });
        deps.logger.warn({ reason, userId: u?.id, emailTag: emailTag(input.email) }, 'staff login failed');
      };

      if (!user || !passwordOk || !user.password_hash || !STAFF.includes(user.role) || !user.is_active) {
        const reason = !user
          ? 'unknown_email'
          : !passwordOk
            ? 'bad_password'
            : !user.is_active
              ? 'inactive'
              : 'not_staff';
        await failure(reason, user);
        throw new AppError('UNAUTHENTICATED', INVALID_LOGIN);
      }

      if (user.totp_secret_enc) {
        if (!input.totp) throw new AppError('TOTP_REQUIRED', 'Enter the code from your authenticator app.');
        if (!verifyTotp(decryptSecret(user.totp_secret_enc, deps.totpKey), input.totp)) {
          await failure('bad_totp', user);
          throw new AppError('UNAUTHENTICATED', 'That authentication code is incorrect.');
        }
      }

      return db.transaction(async (client) => {
        await repo.touchLastLogin(client, user.id);
        const { session } = await issueSession(client, user, ctx);
        await audit(client, {
          actorId: user.id,
          action: 'STAFF_LOGIN_SUCCESS',
          entityType: 'user',
          entityId: user.id,
          after: { role: user.role, totp: user.totp_secret_enc !== null },
          ip: ctx.ip,
        });
        return session;
      });
    },

    // ── Sessions (D-20) ──────────────────────────────────────────────────────
    /** Rotates the refresh token. A revoked token presented again ⇒ the whole family is revoked. */
    async refresh(rawToken: string, ctx: RequestContext): Promise<IssuedSession> {
      const outcome = await db.transaction(async (client) => {
        const row = await repo.findRefreshTokenForUpdate(client, hashToken(rawToken));
        if (!row) return { kind: 'unknown' as const };

        if (row.revoked_at) {
          const sinceRevoked = Date.now() - row.revoked_at.getTime();
          if (row.replaced_by_id && sinceRevoked < REFRESH_RACE_GRACE_MS) return { kind: 'race' as const };
          const revoked = await repo.revokeFamily(client, row.family_id);
          await audit(client, {
            actorId: row.user_id,
            action: 'TOKEN_REUSE_DETECTED',
            entityType: 'refresh_token_family',
            entityId: row.family_id,
            after: { revokedTokens: revoked, presentedTokenId: row.id },
            ip: ctx.ip,
          });
          return { kind: 'reuse' as const, userId: row.user_id, familyId: row.family_id };
        }

        if (row.expires_at.getTime() <= Date.now()) return { kind: 'expired' as const };

        const user = await repo.findUserById(client, row.user_id);
        if (!user || !user.is_active) {
          await repo.revokeFamily(client, row.family_id);
          return { kind: 'inactive' as const };
        }

        const { refreshId, session } = await issueSession(client, user, ctx, row.family_id);
        await repo.markRotated(client, row.id, refreshId);
        return { kind: 'ok' as const, session };
      });

      if (outcome.kind === 'ok') return outcome.session;
      if (outcome.kind === 'reuse') {
        deps.logger.warn(
          { userId: outcome.userId, familyId: outcome.familyId },
          'SECURITY refresh token reuse — family revoked',
        );
      }
      throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.', { reason: outcome.kind });
    },

    async logout(rawToken: string | undefined): Promise<void> {
      if (!rawToken) return;
      const row = await repo.findRefreshToken(db, hashToken(rawToken));
      if (row) await repo.revokeFamily(db, row.family_id);
    },

    async logoutAll(userId: string, ctx: RequestContext): Promise<void> {
      await db.transaction(async (client) => {
        const revoked = await repo.revokeAllForUser(client, userId);
        await audit(client, {
          actorId: userId,
          action: 'LOGOUT_ALL',
          entityType: 'user',
          entityId: userId,
          after: { revokedTokens: revoked },
          ip: ctx.ip,
        });
      });
    },

    async me(userId: string): Promise<{ user: SessionUser; pickupLocationIds: string[] }> {
      const user = await repo.findUserById(db, userId);
      if (!user || !user.is_active)
        throw new AppError('UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
      const pickupLocationIds = user.role === 'KITCHEN_PARTNER' ? await repo.listPickupLocationIds(db, user.id) : [];
      return { user: toSessionUser(user), pickupLocationIds };
    },

    /** Revokes every session (including this one) and issues a fresh session for the caller. */
    async changePassword(userId: string, input: { currentPassword: string; newPassword: string }, ctx: RequestContext) {
      const user = await repo.findUserById(db, userId);
      if (!user?.password_hash || !STAFF.includes(user.role)) throw new AppError('FORBIDDEN', 'Not allowed.');
      if (!(await bcrypt.compare(input.currentPassword, user.password_hash))) {
        throw new AppError('UNAUTHENTICATED', 'Your current password is incorrect.');
      }
      const newHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
      return db.transaction(async (client) => {
        await repo.updatePasswordHash(client, user.id, newHash);
        const revoked = await repo.revokeAllForUser(client, user.id);
        await audit(client, {
          actorId: user.id,
          action: 'PASSWORD_CHANGED',
          entityType: 'user',
          entityId: user.id,
          after: { revokedTokens: revoked },
          ip: ctx.ip,
        });
        return (await issueSession(client, user, ctx)).session;
      });
    },

    // ── ADMIN TOTP 2FA (D-19) — enforcement switches on in Phase 10 ──────────
    async totpSetup(userId: string): Promise<{ otpauthUrl: string }> {
      const user = await repo.findUserById(db, userId);
      if (!user || user.role !== 'ADMIN') throw new AppError('FORBIDDEN', 'Not allowed.');
      const secret = newTotpSecret();
      // Pending until the admin proves the authenticator works (totpVerify)
      await redis.set(`pk:totp:pending:${userId}`, encryptSecret(secret, deps.totpKey), 'EX', TOTP_PENDING_TTL_SEC);
      return { otpauthUrl: totpUrl(secret, user.email ?? user.id) };
    },

    async totpVerify(userId: string, code: string, ctx: RequestContext): Promise<{ enabled: true }> {
      const pendingKey = `pk:totp:pending:${userId}`;
      const pending = await redis.get(pendingKey);
      if (!pending) throw new AppError('VALIDATION_ERROR', 'Setup expired. Start two-factor setup again.');
      if (!verifyTotp(decryptSecret(pending, deps.totpKey), code)) {
        throw new AppError('VALIDATION_ERROR', 'That code is incorrect. Check your authenticator app and try again.');
      }
      await db.transaction(async (client) => {
        await repo.setTotpSecret(client, userId, pending);
        await audit(client, {
          actorId: userId,
          action: 'TOTP_ENROLLED',
          entityType: 'user',
          entityId: userId,
          ip: ctx.ip,
        });
      });
      await redis.del(pendingKey);
      return { enabled: true };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

/** Re-exported for tests that need to act as an authenticator app. */
export { currentTotp };
