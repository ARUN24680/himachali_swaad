import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';
import { privateStorageFromEnv, s3PublicBaseUrl, storageFromEnv } from '../../src/config/storage';
import {
  awsS3PublicBaseUrl,
  awsS3Target,
  createS3PrivateStorage,
  createS3PublicStorage,
  type S3Target,
} from '../../src/integrations/storage/s3';

/** D-58: AWS S3 single bucket — public `products/…`, private `private/…`. */
const aws = {
  region: 'eu-north-1',
  accessKeyId: 'AKIAEXAMPLEEXAMPLE12',
  secretAccessKey: 'secret-secret-secret-secret',
  bucket: 'Pahadikhatki-Assets',
};

describe('AWS S3 public storage (product images)', () => {
  const s3 = createS3PublicStorage('s3', awsS3Target(aws), awsS3PublicBaseUrl(aws));

  it('presigns a 5-minute PUT on the virtual-hosted bucket URL, region-scoped, type + size signed', async () => {
    const up = await s3.presignPut({ key: 'products/p1/a.webp', contentType: 'image/webp', sizeBytes: 1234 });
    const url = new URL(up.url);
    expect(url.origin + url.pathname).toBe(
      'https://pahadikhatki-assets.s3.eu-north-1.amazonaws.com/products/p1/a.webp',
    );
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(
      /^AKIAEXAMPLEEXAMPLE12\/\d{8}\/eu-north-1\/s3\/aws4_request$/,
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(up).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/webp' }, expiresInSec: 300 });
  });

  it('public URL = bucket URL (lowercased) or the configured CDN', () => {
    expect(s3.publicUrl('products/p1/a.webp')).toBe(
      'https://pahadikhatki-assets.s3.eu-north-1.amazonaws.com/products/p1/a.webp',
    );
    const cdn = createS3PublicStorage('s3', awsS3Target(aws), 'https://img.pahadikhatki.in/');
    expect(cdn.publicUrl('products/p1/a.webp')).toBe('https://img.pahadikhatki.in/products/p1/a.webp');
  });
});

describe('AWS S3 private storage (labels, invoices, statements, receipts)', () => {
  const requests: { method: string; url: string; auth: string; body: string; type?: string }[] = [];
  const objects = new Map<string, Buffer>();
  let base = '';
  const server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    requests.push({
      method: req.method!,
      url: req.url!,
      auth: String(req.headers.authorization ?? ''),
      body: body.toString(),
      type: req.headers['content-type'],
    });
    if (req.method === 'PUT') {
      objects.set(req.url!, body);
      return res.writeHead(200).end();
    }
    const obj = objects.get(req.url!);
    if (!obj) return res.writeHead(404).end();
    res.writeHead(200).end(obj);
  });
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  // Same signing code as AWS; only the object URL points at the fake bucket
  const target = (): S3Target => ({ ...awsS3Target(aws), objectUrl: (key) => `${base}/${key}` });

  it('put / get go under private/ with SigV4 auth; a missing object reads as null', async () => {
    const st = createS3PrivateStorage('s3', target(), 'private/');
    await st.put('labels/PK-ABC123.pdf', new TextEncoder().encode('%PDF-1.4'), 'application/pdf');
    const put = requests.at(-1)!;
    expect(put).toMatchObject({ method: 'PUT', url: '/private/labels/PK-ABC123.pdf', body: '%PDF-1.4' });
    expect(put.type).toBe('application/pdf');
    expect(put.auth).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLEEXAMPLE12\/\d{8}\/eu-north-1\/s3\/aws4_request/);

    expect(new TextDecoder().decode((await st.get('labels/PK-ABC123.pdf'))!)).toBe('%PDF-1.4');
    expect(await st.get('labels/missing.pdf')).toBeNull();
  });

  it('signed GET and receipt upload URLs carry the private/ prefix and expiry', async () => {
    const st = createS3PrivateStorage('s3', awsS3Target(aws), 'private/');
    const get = await st.signedGetUrl('invoices/PK-ABC123.pdf', 300);
    const u = new URL(get.url);
    expect(u.pathname).toBe('/private/invoices/PK-ABC123.pdf');
    expect(u.host).toBe('pahadikhatki-assets.s3.eu-north-1.amazonaws.com');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(get.expiresAt.getTime()).toBeGreaterThan(Date.now() + 290_000);

    const up = await st.presignPut({ key: 'expenses/e1/r.pdf', contentType: 'application/pdf', sizeBytes: 10 });
    expect(new URL(up.url).pathname).toBe('/private/expenses/e1/r.pdf');
  });

  it('a failing bucket (403) is an error, not a silent null', async () => {
    const deny = createS3PrivateStorage('s3', { ...target(), objectUrl: () => `${base}/` }, 'private/');
    server.removeAllListeners('request');
    server.on('request', (_req, res) => res.writeHead(403).end());
    await expect(deny.get('labels/x.pdf')).rejects.toThrow(/S3 GET failed with 403/);
  });
});

describe('env + wiring for STORAGE_DRIVER=s3', () => {
  const valid = {
    DATABASE_URL: 'postgres://pk:pw@localhost:5433/pahadi_khatki',
    REDIS_URL: 'redis://localhost:6380',
    APP_ORIGINS: 'http://localhost:3000',
    COOKIE_DOMAIN: 'localhost',
    JWT_SECRET: 'x'.repeat(32),
    TOTP_ENC_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const s3Env = {
    STORAGE_DRIVER: 's3',
    AWS_REGION: 'eu-north-1',
    AWS_ACCESS_KEY_ID: aws.accessKeyId,
    AWS_SECRET_ACCESS_KEY: aws.secretAccessKey,
    AWS_S3_BUCKET_NAME: aws.bucket,
  };

  it('requires all four AWS values', () => {
    expect(() => parseEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow(/AWS_S3_BUCKET_NAME/);
    expect(() => parseEnv({ ...valid, ...s3Env, AWS_REGION: 'Mumbai' })).toThrow(/AWS_REGION/);
    expect(() => parseEnv({ ...valid, ...s3Env, AWS_S3_BUCKET_NAME: 'bad_bucket!' })).toThrow(/AWS_S3_BUCKET_NAME/);
  });

  it('is allowed in production (local is not) and builds s3 public + private stores', () => {
    const env = parseEnv({ ...valid, ...s3Env });
    expect(storageFromEnv(env).kind).toBe('s3');
    expect(privateStorageFromEnv(env).kind).toBe('s3');
    expect(s3PublicBaseUrl(env)).toBe('https://pahadikhatki-assets.s3.eu-north-1.amazonaws.com');
    expect(s3PublicBaseUrl(parseEnv({ ...valid, ...s3Env, AWS_S3_PUBLIC_BASE_URL: 'https://img.x.in' }))).toBe(
      'https://img.x.in',
    );
  });

  it('local stays the default — dev and tests are unchanged', () => {
    const env = parseEnv(valid);
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(storageFromEnv(env).kind).toBe('local');
  });
});
