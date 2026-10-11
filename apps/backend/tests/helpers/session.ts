import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { fromBrowser } from './test-app';

export type Jar = Record<string, string>;

/** Collects Set-Cookie values from a response into a simple cookie jar (cleared cookies are removed). */
export function jarFrom(res: LightMyRequestResponse, jar: Jar = {}): Jar {
  for (const c of res.cookies as { name: string; value: string; maxAge?: number; expires?: Date }[]) {
    const cleared = c.value === '' || c.maxAge === 0 || (c.expires && c.expires.getTime() <= Date.now());
    if (cleared) delete jar[c.name];
    else jar[c.name] = c.value;
  }
  return jar;
}

export async function staffLogin(app: FastifyInstance, email: string, password: string, totp?: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/staff/login',
    headers: fromBrowser(),
    payload: { email, password, ...(totp ? { totp } : {}) },
  });
  return { res, jar: jarFrom(res) };
}

export async function otpLogin(app: FastifyInstance, phone: string, codeFor: (phone: string) => string | undefined) {
  await app.inject({ method: 'POST', url: '/api/v1/auth/otp/send', headers: fromBrowser(), payload: { phone } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/otp/verify',
    headers: fromBrowser(),
    payload: { phone, otp: codeFor(phone) },
  });
  return { res, jar: jarFrom(res) };
}
