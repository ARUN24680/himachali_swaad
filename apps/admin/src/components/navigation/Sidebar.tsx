import { cn } from '@pk/ui';
import { Mountain } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import type { NavItem } from './nav-items';

/**
 * Deep-pine navigation shell. ≥ 1024px: full sidebar with labels; 768–1023px: compact icon rail
 * with small labels (tablet); hidden below 768px where BottomNav takes over.
 */
export function Sidebar({ items }: { items: NavItem[] }) {
  return (
    <aside className="hidden w-20 shrink-0 self-stretch bg-secondary text-secondary-foreground md:block lg:w-64">
      <div className="sticky top-0 flex h-dvh flex-col">
        <Link
          to="/"
          className="flex h-16 items-center justify-center gap-3 border-b border-secondary-foreground/10 px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset lg:justify-start lg:px-5"
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground [&_svg]:size-5"
          >
            <Mountain />
          </span>
          <span className="hidden min-w-0 lg:grid">
            <span className="truncate font-serif text-lg leading-tight font-semibold">Pahadi Khatki</span>
            <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-secondary-foreground/70 uppercase">
              Operations
            </span>
          </span>
          <span className="sr-only lg:hidden">Pahadi Khatki Operations</span>
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
          <ul className="grid gap-1">
            {items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[0.6875rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm',
                      '[&_svg]:size-5 [&_svg]:shrink-0',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-secondary-foreground/80 hover:bg-secondary-foreground/10 hover:text-secondary-foreground',
                    )
                  }
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
