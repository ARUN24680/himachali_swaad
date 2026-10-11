'use client';

import { cn } from '@pk/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from '@/config/navigation';

/** Desktop nav with the current section marked (aria-current). */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
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
