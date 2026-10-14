import logoIcon from '@pk/ui/brand/logo-icon.png';
import { cn } from '@pk/ui';
import { ExternalLink, Store } from 'lucide-react';
import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { Toaster } from '@/components/feedback/Toaster';
import { BottomNav } from '@/components/navigation/BottomNav';
import { navItemsFor } from '@/components/navigation/nav-items';
import { Sidebar } from '@/components/navigation/Sidebar';
import { useMe } from '@/hooks/useMe';
import { env } from '@/lib/env';
import { UserMenu } from '@/modules/auth';

/**
 * Signed-in shell (Phase 3 §3.7): sidebar / icon rail on tablet+desktop, bottom nav on phones,
 * role-aware items. The partner Packing Desk gets its own PartnerLayout in Phase 7.
 */
export function AdminLayout() {
  const me = useMe();
  const items = me.data ? navItemsFor(me.data.user.role) : [];
  const hasBottomNav = items.length >= 2;

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
            <Link
              to="/"
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
              <img src={logoIcon} alt="Pahadi Khatki" className="size-8 object-contain" />
              <span className="truncate font-serif text-lg font-semibold">Pahadi Khatki</span>
            </Link>
            <p className="hidden text-sm text-muted-foreground md:block">Operations portal</p>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={env.VITE_STOREFRONT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                title="Open customer storefront in a new tab"
              >
                <Store aria-hidden="true" className="size-3.5 text-accent-foreground" />
                <span className="hidden sm:inline">View Store</span>
                <ExternalLink aria-hidden="true" className="size-3 text-muted-foreground" />
              </a>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>
        <main
          id="main"
          className={cn(
            'mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8',
            hasBottomNav && 'pb-28 md:pb-8',
          )}
        >
          <Suspense
            fallback={
              <div
                role="status"
                aria-label="Loading"
                className="h-40 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
              />
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav items={items} />
      <Toaster />
    </div>
  );
}
