import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

/**
 * POST /api/revalidate — called by the backend after catalog/stock writes commit (Phase 3 §3.2).
 * Auth: shared secret header (REVALIDATE_SECRET, server-only). Only known tags can be purged.
 */
const BodySchema = z.object({
  tags: z
    .array(z.enum(['products']))
    .min(1)
    .max(10),
});

const digest = (value: string) => createHash('sha256').update(value).digest();

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  const given = request.headers.get('x-revalidate-secret');
  if (!secret || !given || !timingSafeEqual(digest(secret), digest(given))) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ revalidated: false }, { status: 400 });

  // Catalog writes (including clearing demos) must be visible on the next request.
  // 'max' serves the old catalog to that visitor while refreshing in the background.
  for (const tag of body.data.tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: true, tags: body.data.tags });
}
