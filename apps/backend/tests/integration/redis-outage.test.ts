import { Redis } from 'ioredis';
import { expect, inject, it } from 'vitest';
import { createRedis } from '../../src/config/redis';

it('bounds HTTP Redis waits while allowing a worker to recover after a Redis stall', async () => {
  const url = inject('redisUrl');
  const control = new Redis(url);
  const api = createRedis(url, 'outage-api');
  const worker = createRedis(url, 'outage-worker', 'worker');
  try {
    await Promise.all([control.ping(), api.ping(), worker.ping()]);
    await control.call('CLIENT', 'PAUSE', '4000', 'ALL');
    const result = await Promise.allSettled([api.ping(), worker.ping()]);
    expect(result[0]).toMatchObject({ status: 'rejected', reason: { message: 'Command timed out' } });
    expect(result[1]).toEqual({ status: 'fulfilled', value: 'PONG' });
    expect(await api.ping()).toBe('PONG');
  } finally {
    control.disconnect();
    api.disconnect();
    worker.disconnect();
  }
}, 10_000);
