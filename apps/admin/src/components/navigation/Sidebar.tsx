import { cn } from '@pk/ui';
import { Mountain } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import type { NavGroup, NavItem } from './nav-items';

const groupsOf = (items: NavItem[]) => {
  const out = new Map<NavGroup, NavItem[]>();
  for (const item of items) out.set(item.group, [...(out.get(item.group) ?? []), item]);
  return [...out.entries()];
};

/**
 * Deep-pine navigation shell. ≥ 1024px: full sidebar with grouped labels; 768–1023px: compact icon
 * rail with small labels (tablet); hidden below 768px where BottomNav takes over.
 */
export function Sidebar({ items }: { items: NavItem[] }) {
  const groups = groupsOf(items);
  return (
    <aside className="hidden w-24 shrink-0 self-stretch bg-secondary text-secondary-foreground md:block lg:w-64">
      <div className="sticky top-0 flex h-dvh flex-col">
        <Link
          to="/"
          className="flex h-16 shrink-0 items-center justify-center gap-3 border-b border-secondary-foreground/10 px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset lg:justify-start lg:px-5"
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
          <div className="grid gap-4">
            {groups.map(([group, list]) => (
              <div key={group} className="grid gap-1">
                {groups.length > 1 && (
                  <p className="hidden px-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-secondary-foreground/60 uppercase lg:block">
                    {group}
                  </p>
                )}
                <ul className="grid gap-1">
                  {list.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-11 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-2 text-center text-[0.6875rem] leading-tight font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-left lg:text-sm',
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
              </div>
            ))}
          </div>
        </nav>
      </div>
    </aside>
  );
}
