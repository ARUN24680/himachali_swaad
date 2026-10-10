import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import { ThemeToggle } from '@/components/common/ThemeToggle';

/** Temporary shell until AdminLayout / PartnerLayout arrive (Phase 2–3). */
export function AppShell() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
          <Link to="/" className="font-serif text-lg font-semibold">
            Pahadi Khatki <span className="font-sans text-sm font-normal text-muted-foreground">Operations</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" aria-label="Loading" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
