import { NextResponse, type NextRequest } from 'next/server';
import { NOINDEX_HEADER_VALUE, NOINDEX_ROBOTS_PATH, indexingPolicy, launchMode, lockDecision } from '@/lib/launch-mode';

/**
 * Two host-aware policies (see `lib/launch-mode.ts`):
 * 1. Pre-launch lock — while `LAUNCH_MODE` resolves to `coming-soon` (production default), `/` shows
 *    the teaser and every other page answers 404 with the product-neutral not-found page.
 * 2. Indexing — in a production build, hosts other than the production domain (staging, localhost)
 *    get `X-Robots-Tag: noindex` and a disallow-all robots.txt (audit 2026-11-03, M-4).
 * Development and `LAUNCH_MODE=live` on the production host pass everything through.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.hostname;
  const pathname = request.nextUrl.pathname;
  const noindex = indexingPolicy(process.env, host) === 'noindex';

  let response: NextResponse;
  if (noindex && pathname === '/robots.txt') {
    const url = request.nextUrl.clone();
    url.pathname = NOINDEX_ROBOTS_PATH;
    url.search = '';
    response = NextResponse.rewrite(url);
  } else if (launchMode(process.env, host) !== 'coming-soon') {
    response = NextResponse.next();
  } else {
    const decision = lockDecision(pathname);
    if (decision.action === 'pass') {
      response = NextResponse.next();
    } else {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = '';
      response = NextResponse.rewrite(url, decision.status ? { status: decision.status } : undefined);
    }
  }

  if (noindex) response.headers.set('x-robots-tag', NOINDEX_HEADER_VALUE);
  return response;
}

export const config = {
  // Skip static framework files up front; everything else is decided above.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
