import { cn } from '@pk/ui';
import logoDark from '@pk/ui/brand/logo-horizontal-dark.png';
import logoIcon from '@pk/ui/brand/logo-icon.png';
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
          aria-label="Pahadi Khatki Operations"
          className="flex h-16 shrink-0 items-center justify-center border-b border-secondary-foreground/10 px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset lg:justify-start lg:px-4"
        >
          {/* Tablet compact rail icon */}
          <img src={logoIcon} alt="Pahadi Khatki" className="size-9 object-contain lg:hidden" />
          {/* Desktop full sidebar: Clean horizontal brand lockup */}
          <div className="hidden min-w-0 items-center lg:flex">
            <img src={logoDark} alt="Pahadi Khatki" className="h-9 w-auto max-w-[215px] object-contain" />
          </div>
          <span className="sr-only lg:hidden">Pahadi Khatki Operations</span>
        </Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-4 lg:px-3">
          <div className="grid gap-4">
            {groups.map(([group, groupItems]) => (
              <div key={group} className="grid gap-1">
                <span className="hidden px-2 text-[0.6875rem] font-semibold tracking-[0.14em] text-secondary-foreground/50 uppercase lg:block">
                  {group}
                </span>
                <ul className="grid gap-0.5">
                  {groupItems.map(({ to, label, icon: Icon, end }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        className={({ isActive }) =>
                          cn(
                            'group flex min-h-11 items-center justify-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary lg:justify-start',
                            isActive
                              ? 'bg-secondary-foreground/10 text-primary' /* Mountain Gold on Deep Pine (AA in both themes) */
                              : 'text-secondary-foreground/80 hover:bg-secondary-foreground/5 hover:text-secondary-foreground',
                          )
                        }
                      >
                        <span className="relative flex shrink-0 items-center justify-center">
                          <Icon aria-hidden="true" className="size-5 shrink-0" />
                        </span>
                        <span className="hidden truncate lg:inline">{label}</span>
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
