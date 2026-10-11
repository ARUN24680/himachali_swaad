import { describe, expect, it, vi } from 'vitest';
import { createConversionsClient, hashForMeta } from '../../src/integrations/meta/conversions';
import { silentLogger } from '../helpers/test-logger';

describe('Meta Conversions API client', () => {
  it('hashes identifiers the way Meta normalises them', () => {
    expect(hashForMeta('  919876543210 ')).toBe(hashForMeta('919876543210'));
    expect(hashForMeta('A@B.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashForMeta('A@B.com')).toBe(hashForMeta('a@b.com'));
  });

  it('is a no-op without credentials', async () => {
    const fetchImpl = vi.fn();
    const c = createConversionsClient({ logger: silentLogger(), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(c.enabled).toBe(false);
    await c.send({ eventName: 'ViewContent', eventId: 'e1', eventTime: 1, eventSourceUrl: 'https://x', userData: {} });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts event_id + action_source and never throws on failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }));
    const c = createConversionsClient({
      pixelId: '123',
      accessToken: 'tok',
      logger: silentLogger(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await c.send({ eventName: 'AddToCart', eventId: 'e2', eventTime: 5, eventSourceUrl: 'https://x', userData: {} });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/123/events');
    const body = JSON.parse(init.body as string);
    expect(body.data[0]).toMatchObject({ event_name: 'AddToCart', event_id: 'e2', action_source: 'website' });
  });
});
