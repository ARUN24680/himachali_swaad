/**
 * AWS S3 helpers for STORAGE_DRIVER=s3 (D-58). Run from apps/backend with the repo .env:
 *
 *   pnpm s3:check            read/write smoke test: bucket, private signed GET, public image, CORS
 *   pnpm s3:setup [--apply]  bucket CORS (PUT/GET from APP_ORIGINS) + public-read policy on products/*
 *   pnpm s3:sync  [--apply]  copy existing local uploads (.uploads, .uploads-private) into the bucket
 *
 * Without --apply, setup and sync only print what they would do. Secrets are never printed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { AwsClient } from 'aws4fetch';
import { loadEnvOrExit, type Env } from '../src/config/env';
import { S3_PRIVATE_PREFIX, s3PublicBaseUrl, storageFromEnv, privateStorageFromEnv } from '../src/config/storage';
import { awsS3Target } from '../src/integrations/storage/s3';

const env = loadEnvOrExit({ ...process.env, STORAGE_DRIVER: 's3' });
const apply = process.argv.includes('--apply');
const command = process.argv[2];

const target = awsS3Target({
  region: env.AWS_REGION!,
  accessKeyId: env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
  bucket: env.AWS_S3_BUCKET_NAME!,
});
const client = new AwsClient({
  accessKeyId: env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
  service: 's3',
  region: env.AWS_REGION!,
});
const bucket = env.AWS_S3_BUCKET_NAME!.toLowerCase();
const bucketUrl = (query: string) => `${target.objectUrl('')}?${query}`;
const ok = (msg: string) => console.log(`  ✔ ${msg}`);
const bad = (msg: string, fix: string) => {
  console.log(`  ✖ ${msg}\n      → ${fix}`);
  failures += 1;
};
let failures = 0;

async function s3Error(res: Response) {
  const text = await res.text().catch(() => '');
  return text.match(/<Code>([^<]+)<\/Code>/)?.[1] ?? `HTTP ${res.status}`;
}

async function check() {
  console.log(`S3 check — bucket ${bucket} (${env.AWS_REGION})`);
  if (env.AWS_S3_BUCKET_NAME !== bucket) {
    console.log('  ! AWS_S3_BUCKET_NAME has capital letters; S3 bucket names are lowercase — using', bucket);
  }

  const head = await client.fetch(target.objectUrl(''), { method: 'HEAD' });
  // S3 sends x-amz-bucket-region on 403s too — it only means "wrong region" when it differs from ours
  const bucketRegion = head.headers.get('x-amz-bucket-region');
  if (head.ok) ok('bucket reachable with these keys');
  else if (head.status === 301 || (bucketRegion && bucketRegion !== env.AWS_REGION)) {
    return bad(`bucket is in ${bucketRegion ?? 'another region'}`, 'set AWS_REGION to that region');
  } else if (head.status === 404) return bad('bucket not found', 'check AWS_S3_BUCKET_NAME (exact name, lowercase)');
  else if (head.status === 403) {
    // HEAD bucket needs s3:ListBucket, which the app never uses — carry on with the object checks
    console.log('  ! HEAD bucket → 403 (no s3:ListBucket; fine — the app only needs object access)');
  } else
    return bad(`HEAD bucket → ${head.status}`, 'check the access key and that the IAM user may access this bucket');

  // Private: put → signed GET → anonymous GET must fail
  const priv = privateStorageFromEnv(env);
  const pkey = `healthcheck/${randomUUID()}.txt`;
  try {
    await priv.put(pkey, new TextEncoder().encode('pk-private-ok'), 'text/plain');
    ok(`private upload (${S3_PRIVATE_PREFIX}${pkey})`);
    const { url } = await priv.signedGetUrl(pkey, 60);
    const got = await fetch(url);
    if (got.ok && (await got.text()) === 'pk-private-ok') ok('private signed GET (5-min links for invoices, labels)');
    else bad(`signed GET → ${got.status}`, 'IAM user needs s3:GetObject');
    const anon = await fetch(target.objectUrl(`${S3_PRIVATE_PREFIX}${pkey}`));
    if (anon.status === 403) ok('private files are NOT publicly readable');
    else bad(`anonymous GET of a private file → ${anon.status}`, 'remove public access to private/* (D-11: PII)');
  } catch (err) {
    bad(`private upload failed: ${(err as Error).message}`, 'IAM user needs s3:PutObject on the bucket');
  }

  // Public: presigned PUT (what the admin browser does) → anonymous GET via the public base URL
  const pub = storageFromEnv(env);
  const ikey = `products/_healthcheck/${randomUUID()}.txt`;
  const up = await pub.presignPut({ key: ikey, contentType: 'text/plain', sizeBytes: 9 });
  const put = await fetch(up.url, { method: 'PUT', headers: up.headers, body: 'pk-pub-ok' });
  if (put.ok) {
    ok('presigned PUT (admin image upload path)');
    const read = await fetch(pub.publicUrl(ikey));
    if (read.ok) ok(`product images publicly readable at ${s3PublicBaseUrl(env)}`);
    else
      bad(
        `public GET of products/* → ${read.status}`,
        'run `pnpm s3:setup --apply` (public-read policy on products/*); if it fails, turn off "Block public bucket policies" for this bucket',
      );
  } else bad(`presigned PUT → ${put.status} ${await s3Error(put)}`, 'IAM user needs s3:PutObject');

  // CORS: the admin browser PUTs straight to S3
  const origin = env.APP_ORIGINS.find((o) => !o.includes(':3000')) ?? env.APP_ORIGINS[0]!;
  const pre = await fetch(target.objectUrl(ikey), {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
  });
  if (pre.ok && pre.headers.get('access-control-allow-origin')) ok(`CORS allows PUT from ${origin}`);
  else bad(`CORS preflight from ${origin} → ${pre.status}`, 'run `pnpm s3:setup --apply`');

  for (const key of [`${S3_PRIVATE_PREFIX}${pkey}`, ikey]) {
    await client.fetch(target.objectUrl(key), { method: 'DELETE' }).catch(() => undefined);
  }
  console.log(failures ? `\n${failures} problem(s) — fix the → items and run again.` : '\nAll good — S3 is ready.');
}

async function setup() {
  const origins = env.APP_ORIGINS;
  const cors = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration><CORSRule>${origins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('')}<AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>content-type</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'PublicReadProductImages',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${bucket}/products/*`,
      },
    ],
  });
  console.log(
    `S3 setup — bucket ${bucket}\nCORS origins: ${origins.join(', ')}\nPolicy: public GetObject on products/* only (private/* stays private)`,
  );
  if (!apply) return console.log('\nDry run. Re-run with --apply to write these to the bucket.');

  const md5 = createHash('md5').update(cors).digest('base64');
  const c = await client.fetch(bucketUrl('cors'), {
    method: 'PUT',
    body: cors,
    headers: { 'content-md5': md5, 'content-type': 'application/xml' },
  });
  if (c.ok) ok('CORS rule saved');
  else bad(`CORS → ${await s3Error(c)}`, 'IAM user needs s3:PutBucketCORS (or set it in the S3 console)');
  const p = await client.fetch(bucketUrl('policy'), { method: 'PUT', body: policy });
  if (p.ok) ok('bucket policy saved (products/* public-read)');
  else
    bad(
      `policy → ${await s3Error(p)}`,
      'S3 console → bucket → Permissions → Block public access: untick "Block public access granted through new/any public bucket policies", then re-run (or paste the policy above in the console)',
    );
}

async function* files(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (e.isFile()) yield p;
  }
}

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
};

async function sync(e: Env) {
  const roots = [
    { dir: resolve(e.LOCAL_UPLOADS_DIR), prefix: '', label: 'public' },
    { dir: resolve(e.LOCAL_PRIVATE_UPLOADS_DIR), prefix: S3_PRIVATE_PREFIX, label: 'private' },
  ];
  let count = 0;
  for (const r of roots) {
    for await (const file of files(r.dir)) {
      const key = r.prefix + relative(r.dir, file).split(sep).join('/');
      count += 1;
      if (!apply) {
        console.log(`  would upload ${r.label}: ${key}`);
        continue;
      }
      const ext = file.split('.').pop()!.toLowerCase();
      const res = await client.fetch(target.objectUrl(key), {
        method: 'PUT',
        body: await readFile(file),
        headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream' },
      });
      if (res.ok) ok(key);
      else bad(`${key} → ${await s3Error(res)}`, 'check s3:PutObject permission');
    }
  }
  console.log(
    apply ? `\nUploaded ${count - failures}/${count} file(s).` : `\n${count} file(s). Re-run with --apply to upload.`,
  );
}

if (command === 'check') await check();
else if (command === 'setup') await setup();
else if (command === 'sync') await sync(env);
else {
  console.log('usage: s3-tools.ts check | setup [--apply] | sync [--apply]');
  process.exit(2);
}
process.exit(failures ? 1 : 0);
