import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import { createShiprocketClient, ShiprocketError, type ShiprocketApi } from '../../src/integrations/shiprocket/client';
import { createShiprocketSandbox } from '../../src/integrations/shiprocket/sandbox';
import { silentLogger } from './test-logger';

export const TEST_COURIER_TOKEN = 'test-courier-webhook-token-0123456789';

/** Default for tests that never ship: every call fails like an unreachable API. */
export function unreachableShiprocket(): ShiprocketApi {
  const fail = async (): Promise<never> => {
    throw new ShiprocketError('shiprocket not configured in this test', null, true);
  };
  return {
    checkServiceability: fail,
    createOrder: fail,
    assignAwb: fail,
    generateLabel: fail,
    generatePickup: fail,
    generateManifest: fail,
    cancelShipment: fail,
    cancelOrder: fail,
    trackByAwb: fail,
    getWalletBalancePaise: fail,
    downloadDocument: fail,
  };
}

/**
 * The Shiprocket sandbox on an ephemeral port + the REAL HTTP client pointed at it — the
 * production client code runs in tests with no outbound call (Phase 6 §6.13).
 */
export async function startShiprocketSandbox(redis: Redis) {
  let base = '';
  const sandbox = createShiprocketSandbox({ baseUrl: () => base, email: 'api@test.in', password: 'api-pass' });
  const server = Fastify({ logger: false });
  await server.register(sandbox.plugin);
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  base = `${address}/`;
  const keyPrefix = `pk:test-shiprocket:${randomBytes(4).toString('hex')}`;
  const client = createShiprocketClient({
    keyPrefix,
    baseUrl: base,
    email: 'api@test.in',
    password: 'api-pass',
    redis,
    logger: silentLogger(),
    timeoutMs: 3_000,
  });
  return { sandbox: sandbox.state, client, baseUrl: base, keyPrefix, close: () => server.close() };
}
