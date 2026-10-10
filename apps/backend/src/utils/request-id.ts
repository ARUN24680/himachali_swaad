import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const SAFE_INCOMING_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

/** Reuse a well-formed incoming `x-request-id` (from the edge/proxy), otherwise generate one. */
export function genRequestId(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && SAFE_INCOMING_ID.test(incoming)) return incoming;
  return `req_${randomUUID()}`;
}
