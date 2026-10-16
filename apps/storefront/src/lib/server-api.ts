import type { z } from 'zod';
import { env } from '@/lib/env';

/** Revalidated by the backend after catalog/stock writes (POST /api/revalidate → tag `products`, D-49 i). */
export const CACHE_TAGS = {
  products: 'products',
  product: (slug: string) => `product:${slug}`,
} as const;

/** Safety net if a revalidate webhook is ever missed (seconds). */
const FALLBACK_REVALIDATE_SECONDS = 300;

export class ServerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

/**
 * Server Component GET to the backend (D-05): cached with tags, envelope unwrapped, `data` parsed with
 * the shared Zod schema so a contract drift fails loudly instead of rendering garbage.
 */
export async function serverGet<S extends z.ZodType>(path: string, schema: S, tags: string[]): Promise<z.infer<S>> {
  const baseUrl = (process.env.INTERNAL_API_URL || env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000').replace(
    /\/+$/,
    '',
  );
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: { accept: 'application/json' },
    cache: 'force-cache',
    next: { tags, revalidate: FALLBACK_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: unknown;
    error?: { code?: string; message?: string } | null;
  } | null;
  if (!res.ok || payload?.success !== true) {
    throw new ServerApiError(
      res.status,
      payload?.error?.code ?? 'BAD_RESPONSE',
      payload?.error?.message ?? `GET ${path} failed (${res.status})`,
    );
  }
  return schema.parse(payload.data);
}

export const isNotFound = (err: unknown) => err instanceof ServerApiError && err.status === 404;
