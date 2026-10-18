import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ok } from '../../lib/envelope';
import { AppError } from '../../lib/errors';
import type { AlertsService } from './alerts.service';
import type { EmailChannel } from './email';
import type { ObserverChannel } from './observer';

const header = (request: FastifyRequest, name: string) => {
  const v = request.headers[name];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Inbound credit alerts. Bodies are kept raw: the observer HMAC is over the exact bytes, and SNS
 * posts JSON as text/plain. Authentication is per channel (SNS signature / device HMAC), never cookies.
 */
export const alertRoutes: FastifyPluginAsync<{ email: EmailChannel | null; observer: ObserverChannel | null }> = async (
  app,
  { email, observer },
) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 262_144 }, (_req, body, done) => done(null, body));
  const limit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  if (email) {
    app.post('/inbound/ses', limit, async (request) => {
      let json: unknown;
      try {
        json = JSON.parse((request.body as Buffer).toString('utf8'));
      } catch {
        throw new AppError('BAD_REQUEST_ERROR', 'Malformed SNS message');
      }
      try {
        return ok(request, { result: await email.handle(json) });
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Signature / topic / DKIM-format problems: 400 so SNS does not retry a forged message forever
        request.log.warn({ reason: (err as Error).message }, 'SNS message rejected');
        throw new AppError('BAD_REQUEST_ERROR', 'Message rejected');
      }
    });
  }

  if (observer) {
    const signed = (request: FastifyRequest) => ({
      deviceId: header(request, 'x-device-id'),
      timestamp: header(request, 'x-timestamp'),
      nonce: header(request, 'x-nonce'),
      signature: header(request, 'x-signature'),
      rawBody: (request.body as Buffer | undefined) ?? Buffer.alloc(0),
    });
    app.post('/observer/alerts', limit, async (request) => {
      const outcome = await observer.handleAlert(signed(request));
      // The phone only needs to know it was stored; it learns nothing about orders
      return ok(request, { received: true, status: outcome.status === 'MATCHED' ? 'MATCHED' : 'STORED' });
    });
    app.post('/observer/heartbeat', limit, async (request) => {
      await observer.heartbeat(signed(request));
      return ok(request, { received: true });
    });
  }
};

const DevAlert = z.object({
  amountPaise: z.number().int().positive(),
  utr: z
    .string()
    .regex(/^\d{12}$/)
    .optional(),
});

/** /dev — local simulator: "the bank says ₹X arrived". Registered only with PAYMENT_DEV_TOOLS (refused in production). */
export const devRoutes: FastifyPluginAsync<{ alerts: AlertsService }> = async (app, { alerts }) => {
  app.post('/alerts', async (request) => {
    const body = DevAlert.parse(request.body);
    const utr = body.utr ?? String(100_000_000_000 + (randomBytes(5).readUIntBE(0, 5) % 900_000_000_000));
    const outcome = await alerts.ingest({
      source: 'DEV',
      externalId: `dev:${randomBytes(8).toString('hex')}`,
      sender: 'dev-simulator',
      creditedAt: new Date(),
      amountPaise: body.amountPaise,
      utr,
    });
    return ok(request, { utr, ...outcome });
  });
};
