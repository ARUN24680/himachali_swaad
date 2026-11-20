'use client';

import { cn } from '@pk/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from '@/config/navigation';

/** Desktop nav (pointer devices, md+): a 44px pill track — same height as the header's buttons — with 36px link pills; the current section is a raised card pill (aria-current). */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex h-11 items-center gap-0.5 rounded-full border border-border bg-muted/80 px-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-4',
                active
                  ? 'bg-cta font-semibold text-cta-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
              )}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
