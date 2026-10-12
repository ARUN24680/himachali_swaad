import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';

export const ACCESS_COOKIE = 'pk_at';
export const REFRESH_COOKIE = 'pk_rt';
/** Refresh cookie is only sent to auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface CookieConfig {
  /** `.pahadikhatki.in` in prod; undefined on localhost (host-only cookie). */
  domain?: string;
  secure: boolean;
  accessTtlSec: number;
  refreshTtlSec: number;
}

const base = (c: CookieConfig): CookieSerializeOptions => ({
  httpOnly: true,
  secure: c.secure,
  sameSite: 'lax',
  ...(c.domain ? { domain: c.domain } : {}),
});

export function setSessionCookies(reply: FastifyReply, c: CookieConfig, tokens: { access: string; refresh: string }) {
  reply.setCookie(ACCESS_COOKIE, tokens.access, { ...base(c), path: '/', maxAge: c.accessTtlSec });
  reply.setCookie(REFRESH_COOKIE, tokens.refresh, { ...base(c), path: REFRESH_COOKIE_PATH, maxAge: c.refreshTtlSec });
}

/** Replace only the access cookie (e.g. after enabling 2FA — the refresh token stays). */
export function setAccessCookie(reply: FastifyReply, c: CookieConfig, access: string) {
  reply.setCookie(ACCESS_COOKIE, access, { ...base(c), path: '/', maxAge: c.accessTtlSec });
}

export function clearSessionCookies(reply: FastifyReply, c: CookieConfig) {
  reply.clearCookie(ACCESS_COOKIE, { ...base(c), path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { ...base(c), path: REFRESH_COOKIE_PATH });
}
