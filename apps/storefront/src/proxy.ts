import { NextResponse, type NextRequest } from 'next/server';
import { launchMode, lockDecision } from '@/lib/launch-mode';

/**
 * Pre-launch lock (see `lib/launch-mode.ts`). While `LAUNCH_MODE` resolves to `coming-soon`
 * (production default), `/` shows the teaser and every other page answers 404 with the
 * product-neutral not-found page. Development and `LAUNCH_MODE=live` pass everything through.
 */
export function proxy(request: NextRequest) {
  if (launchMode() !== 'coming-soon') return NextResponse.next();
  const decision = lockDecision(request.nextUrl.pathname);
  if (decision.action === 'pass') return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  url.search = '';
  return NextResponse.rewrite(url, decision.status ? { status: decision.status } : undefined);
}

export const config = {
  // Skip static framework files up front; everything else is decided in `lockDecision`.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
