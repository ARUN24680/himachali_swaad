import { cn } from '@pk/ui';
import { NavLink } from 'react-router';
import type { NavItem } from './nav-items';

export type BottomNavItem = Pick<NavItem, 'to' | 'label' | 'icon' | 'end'> & {
  /** Small count bubble (e.g. orders to pack). */
  badge?: number;
};

/**
 * Phone navigation (< 768px): thumb-reachable tab bar. Hidden when there is only one destination.
 * `size="lg"` = Packing Desk (taller targets, 14px labels).
 */
export function BottomNav({
  items,
  label = 'Main',
  size = 'md',
}: {
  items: BottomNavItem[];
  label?: string;
  size?: 'md' | 'lg';
}) {
  if (items.length < 2) return null;
  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
        {items.map(({ to, label: itemLabel, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-5',
                  size === 'lg' ? 'h-[4.5rem] text-sm' : 'h-16 text-xs',
                  isActive ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'relative grid h-7 w-14 place-items-center rounded-full transition-colors',
                      isActive && 'bg-accent',
                    )}
                  >
                    <Icon aria-hidden="true" />
                    {badge ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground tabular-nums"
                      >
                        {badge > 99 ? '99+' : badge}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    {itemLabel}
                    {badge ? <span className="sr-only"> ({badge})</span> : null}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
