import Link from 'next/link';
import type { ReactNode } from 'react';
import { site } from '@/config/site';

/**
 * Minimal storefront header (full Header/MobileNav arrive in Phase 4).
 * `actions` is a slot so layout components stay free of feature-module imports (D-44).
 */
export function SiteHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 rounded-md font-serif text-xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-2xl"
        >
          {site.name}
        </Link>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
