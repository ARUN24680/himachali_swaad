import { MountainSnow } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { mainNav } from '@/config/navigation';
import { site } from '@/config/site';
import { MobileNav } from './MobileNav';
import { NavLinks } from './NavLinks';

/**
 * Sticky storefront header. Feature controls arrive through slots (`account`, `cart`) so layout
 * components never import feature modules (D-44).
 */
export function SiteHeader({ account, cart }: { account?: ReactNode; cart?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-2 sm:px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-1">
          <MobileNav />
          <Link
            href="/"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-1 font-serif text-xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-2xl"
          >
            <MountainSnow aria-hidden="true" className="size-6 shrink-0 text-accent-foreground" />
            <span className="truncate">{site.name}</span>
          </Link>
        </div>
        <nav aria-label="Main" className="hidden md:block">
          <NavLinks links={mainNav} />
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle className="hidden sm:inline-flex" />
          {account}
          {cart}
        </div>
      </div>
    </header>
  );
}
