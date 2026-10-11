import type { FastifyInstance } from 'fastify';
import type { Queryable } from '../../src/config/db';
import { assignPickupLocation, createPickupLocation, createStaff } from './factories';
import { staffLogin, type Jar } from './session';
import { fromBrowser } from './test-app';

/** ADMIN + a partner mapped to kitchen A, and a second kitchen B the partner can't touch. */
export async function catalogActors(app: FastifyInstance, db: Queryable) {
  const kitchenA = await createPickupLocation(db);
  const kitchenB = await createPickupLocation(db);
  const admin = await createStaff(db, { role: 'ADMIN' });
  const partner = await createStaff(db, { role: 'KITCHEN_PARTNER' });
  await assignPickupLocation(db, partner.id, kitchenA.id);
  const adminJar = (await staffLogin(app, admin.email, admin.password)).jar;
  const partnerJar = (await staffLogin(app, partner.email, partner.password)).jar;
  return { kitchenA, kitchenB, admin, partner, adminJar, partnerJar };
}

export const cookieHeader = (jar: Jar) =>
  Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

/** Authenticated browser-like request (cookies + allowed Origin). */
export function as(app: FastifyInstance, jar: Jar) {
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: fromBrowser({ cookie: cookieHeader(jar) }),
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, payload?: unknown) => call('POST', url, payload ?? {}),
    patch: (url: string, payload: unknown) => call('PATCH', url, payload),
  };
}
