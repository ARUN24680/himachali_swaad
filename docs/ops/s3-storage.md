# AWS S3 file storage (D-58)

Every file the system stores goes to **one S3 bucket** when `STORAGE_DRIVER=s3`:

| Prefix | What | Who can read |
| :--- | :--- | :--- |
| `products/…` | Product photos (admin uploads them straight to S3 with a 5-min presigned PUT) | **Public** (bucket policy) — storefront, admin, Google |
| `private/invoices/…` | GST invoices | Only via 5-min signed links from the API |
| `private/labels/…`, `private/manifests/…` | Shipping labels, pickup manifests (customer name, phone, address) | Only via signed links |
| `private/settlements/…` | Settlement statement PDFs | Only via signed links |
| `private/expenses/…` | Expense receipts (presigned PUT from admin) | Only via signed links |

Code: `apps/backend/src/integrations/storage/s3.ts`, wiring `apps/backend/src/config/storage.ts`.
`local` (dev disk) stays the default for development and tests; `r2` still works.

## 1. Env (backend `.env`)

```bash
STORAGE_DRIVER=s3
AWS_REGION=eu-north-1            # the bucket's region
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
AWS_S3_BUCKET_NAME=…             # exact bucket name — S3 names are lowercase
AWS_S3_PUBLIC_BASE_URL=          # optional: CloudFront / img.pahadikhatki.in in front of the bucket
```

Storefront (`apps/storefront/.env.local`, and `DOCKER_ASSETS_BASE_URL` for `docker-compose.prod.yml`):

```bash
NEXT_PUBLIC_ASSETS_BASE_URL=https://<bucket>.s3.<region>.amazonaws.com   # or the CloudFront URL
```

It must equal the backend's public image base — the storefront only optimises images from that
origin (next/image allowlist + CSP `img-src`). Rebuild / restart the storefront after changing it.

## 2. IAM user (least privilege)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::<bucket>/*" },
    { "Effect": "Allow", "Action": ["s3:ListBucket", "s3:PutBucketCORS", "s3:PutBucketPolicy"], "Resource": "arn:aws:s3:::<bucket>" }
  ]
}
```

`s3:ListBucket` makes a missing file read as "not found" (404) instead of "access denied" (403).
`PutBucketCORS` / `PutBucketPolicy` are only needed for `s3:setup`; remove them afterwards if you like.

## 3. Bucket setup (once)

```bash
cd apps/backend
pnpm s3:setup            # dry run: prints the CORS origins and the policy
pnpm s3:setup --apply    # writes CORS (GET/PUT/HEAD from APP_ORIGINS) + public-read on products/* only
```

If the policy step says `AccessDenied`: S3 console → bucket → **Permissions → Block public access**
→ untick the two *bucket policy* options (keep the two *ACL* options ticked) → re-run. Only
`products/*` becomes public; `private/*` stays private (checked by `s3:check`).

**CORS must list every origin the admin runs on** (`APP_ORIGINS`) — the browser uploads photos and
receipts directly to S3, and the packing desk fetches label PDFs. Re-run `s3:setup --apply` after
adding a domain.

## 4. Check

```bash
pnpm s3:check
```

Uploads + deletes two tiny test files and verifies: keys/region, private upload, private signed GET,
private files NOT public, presigned PUT, product images public, CORS preflight from the admin origin.
Fix every `→` line and re-run until "All good".

## 5. Move existing local files

Products, invoices and labels created while `STORAGE_DRIVER=local` live on disk
(`apps/backend/.uploads`, `.uploads-private`). The database stores only keys, so copying the files
to the same keys is all that is needed:

```bash
pnpm s3:sync             # dry run: lists files
pnpm s3:sync --apply     # uploads products/* as-is and documents under private/
```

Then switch `STORAGE_DRIVER=s3`, set `NEXT_PUBLIC_ASSETS_BASE_URL`, restart API + worker +
storefront.

## Notes

- `pnpm db:seed:catalog -- --publish` and the demo-catalog commands write placeholder photos to local
  disk, so they still need `STORAGE_DRIVER=local`.
- Production refuses `STORAGE_DRIVER=local` (env validation); `s3` is allowed.
- Admin static CSP (`apps/admin/public/_headers`) allows `https://*.amazonaws.com` for images,
  uploads and signed links; add the CloudFront domain if you use one.
