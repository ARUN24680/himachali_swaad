import { cn } from '@pk/ui';
import { NavLink } from 'react-router';
import type { NavItem } from './nav-items';

/** Phone navigation (< 768px): thumb-reachable tab bar. Hidden when there is only one destination. */
export function BottomNav({ items }: { items: NavItem[] }) {
  if (items.length < 2) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-5',
                  isActive ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-7 w-14 place-items-center rounded-full transition-colors',
                      isActive && 'bg-accent',
                    )}
                  >
                    <Icon aria-hidden="true" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
