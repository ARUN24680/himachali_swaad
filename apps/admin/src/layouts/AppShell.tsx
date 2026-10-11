import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { UserMenu } from '@/modules/auth';

/** Temporary signed-in shell until AdminLayout / PartnerLayout arrive (Phase 3+). */
export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <Link
            to="/"
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-md font-serif text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">Pahadi Khatki</span>
            <span className="hidden font-sans text-sm font-normal text-muted-foreground sm:inline">Operations</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <Suspense
          fallback={<div role="status" aria-label="Loading" className="h-40 animate-pulse rounded-lg bg-muted" />}
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
