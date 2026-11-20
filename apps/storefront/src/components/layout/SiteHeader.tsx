import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { mainNav } from '@/config/navigation';
import { site } from '@/config/site';
import { MobileNav } from './MobileNav';
import { NavLinks } from './NavLinks';

/**
 * Sticky floating pill header (D-65 reference: rounded "capsule" bar with a nested nav pill).
 * Sticky, not fixed, so it reserves its own height and nothing slides underneath on load. Feature controls arrive through slots (`account`, `cart`) so layout
 * components never import feature modules (D-44).
 */
export function SiteHeader({ account, cart }: { account?: ReactNode; cart?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 md:pt-4">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 rounded-full border border-border bg-background/95 px-2 text-foreground shadow-float backdrop-blur supports-backdrop-filter:bg-background/85 sm:px-3 md:pl-5">
        <div className="flex min-w-0 items-center gap-2">
          <MobileNav />
          <Link
            href="/"
            aria-label={site.name}
            className="flex min-h-11 min-w-0 items-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandLogo size="md" />
          </Link>
        </div>
        <nav aria-label="Main" className="hidden md:block">
          <NavLinks links={mainNav} />
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          {account}
          {cart}
        </div>
      </div>
    </header>
  );
}
