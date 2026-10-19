import { describe, expect, it } from 'vitest';
import { createLocalDiskStorage } from '../../src/integrations/storage/local-disk';
import { createR2Storage } from '../../src/integrations/storage/r2';

describe('R2 presigned PUT (D-11)', () => {
  const r2 = createR2Storage({
    endpoint: 'https://acc123.r2.cloudflarestorage.com',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'secret',
    bucket: 'pk-public',
    publicBaseUrl: 'https://img.pahadikhatki.in/',
  });

  it('signs content-type and content-length into a 5-minute URL for the exact key', async () => {
    const up = await r2.presignPut({ key: 'products/p1/a.webp', contentType: 'image/webp', sizeBytes: 1234 });
    const url = new URL(up.url);
    expect(url.origin + url.pathname).toBe('https://acc123.r2.cloudflarestorage.com/pk-public/products/p1/a.webp');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(up.headers).toEqual({ 'content-type': 'image/webp' });
  });

  it('serves from the CDN domain', () => {
    expect(r2.publicUrl('products/p1/a.webp')).toBe('https://img.pahadikhatki.in/products/p1/a.webp');
  });
});

describe('local disk storage (dev stand-in)', () => {
  it('rejects expired and tampered upload tokens', async () => {
    let now = 1_000_000;
    const s = createLocalDiskStorage({
      dir: '/tmp/pk-unit',
      apiBaseUrl: 'http://localhost:4000',
      secret: 'k',
      now: () => now,
    });
    const up = await s.presignPut({ key: 'products/p/a.png', contentType: 'image/png', sizeBytes: 3 });
    const token = new URL(up.url).searchParams.get('token')!;
    expect(s.verifyUpload(token)).toEqual({ key: 'products/p/a.png', contentType: 'image/png', sizeBytes: 3 });
    expect(s.verifyUpload(`${token}x`)).toBeNull();
    now += 301_000;
    expect(s.verifyUpload(token)).toBeNull();
  });

  it('refuses keys that escape the storage root', async () => {
    const s = createLocalDiskStorage({ dir: '/tmp/pk-unit', apiBaseUrl: 'http://localhost:4000', secret: 'k' });
    await expect(s.write('../../etc/evil', Buffer.from('x'))).rejects.toThrow(/escapes/);
  });
});

describe('local disk delete (product images)', () => {
  it('unlinks the file, treats a missing file as deleted, refuses keys outside products/', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'pk-unit-del-'));
    const s = createLocalDiskStorage({ dir, apiBaseUrl: 'http://localhost:4000', secret: 'k' });
    await s.write('products/p1/a.webp', Buffer.from('x'));
    await s.write('private/invoices/i.pdf', Buffer.from('x'));
    await s.delete('products/p1/a.webp');
    expect(await s.read('products/p1/a.webp')).toBeNull();
    await expect(s.delete('products/p1/a.webp')).resolves.toBeUndefined(); // ENOENT = success
    for (const bad of [
      'private/invoices/i.pdf',
      'products/../private/invoices/i.pdf',
      'products/a.webp',
      '/products/p1/a',
    ]) {
      await expect(s.delete(bad)).rejects.toThrow(/outside products/);
    }
    expect(await s.read('private/invoices/i.pdf')).not.toBeNull();
  });
});

describe('assertProductImageKey', () => {
  it('accepts products/<id>/<file> only', async () => {
    const { assertProductImageKey } = await import('../../src/integrations/storage/storage');
    expect(() => assertProductImageKey('products/7f0c/0a1b.webp')).not.toThrow();
    for (const bad of ['', 'products/', 'products//a.webp', 'products/p/./a', 'products\\p\\a', 'labels/x.pdf']) {
      expect(() => assertProductImageKey(bad)).toThrow();
    }
  });
});
