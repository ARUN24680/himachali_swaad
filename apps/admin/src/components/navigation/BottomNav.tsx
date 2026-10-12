import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle, cn } from '@pk/ui';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { matchPath, NavLink, useLocation } from 'react-router';
import type { NavItem } from './nav-items';

export type BottomNavItem = Pick<NavItem, 'to' | 'label' | 'icon' | 'end'> & {
  /** Small count bubble (e.g. orders to pack). */
  badge?: number;
  /** With more than five destinations only `primary` ones stay in the bar; the rest go behind "More". */
  primary?: boolean;
};

const MAX_TABS = 5;

const tabClass = (size: 'md' | 'lg', active: boolean) =>
  cn(
    'flex w-full flex-col items-center justify-center gap-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-5',
    size === 'lg' ? 'h-[4.5rem] text-sm' : 'h-16 text-xs',
    active ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
  );

function TabFace({ item, active }: { item: BottomNavItem; active: boolean }) {
  const { icon: Icon, label, badge } = item;
  return (
    <>
      <span
        className={cn(
          'relative grid h-7 w-14 place-items-center rounded-full transition-colors',
          active && 'bg-accent',
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
        {label}
        {badge ? <span className="sr-only"> ({badge})</span> : null}
      </span>
    </>
  );
}

/**
 * Phone navigation (< 768px): thumb-reachable tab bar. Hidden when there is only one destination.
 * More than five destinations (ADMIN console) → primary tabs + a "More" bottom sheet.
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
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  if (items.length < 2) return null;

  const overflow = items.length > MAX_TABS;
  const tabs = overflow ? items.filter((i) => i.primary).slice(0, MAX_TABS - 1) : items;
  const rest = overflow ? items.filter((i) => !tabs.includes(i)) : [];
  const isActive = (i: BottomNavItem) => Boolean(matchPath({ path: i.to, end: i.end ?? false }, pathname));
  const moreActive = rest.some(isActive);

  return (
    <nav
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md auto-cols-fr grid-flow-col">
        {tabs.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive: a }) => tabClass(size, a)}>
              {({ isActive: a }) => <TabFace item={item} active={a} />}
            </NavLink>
          </li>
        ))}
        {overflow && (
          <li>
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                onClick={() => setMoreOpen(true)}
                className={tabClass(size, moreActive)}
              >
                <TabFace item={{ to: '#more', label: 'More', icon: Ellipsis }} active={moreActive} />
              </button>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                  <SheetDescription>Every section of the operations portal.</SheetDescription>
                </SheetHeader>
                <SheetBody>
                  <ul className="grid grid-cols-2 gap-2 pb-2">
                    {rest.map(({ to, label: itemLabel, icon: Icon, end }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={() => setMoreOpen(false)}
                          className={({ isActive: a }) =>
                            cn(
                              'flex min-h-14 items-center gap-3 rounded-lg border border-border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5 [&_svg]:shrink-0',
                              a ? 'border-secondary bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                            )
                          }
                        >
                          <Icon aria-hidden="true" />
                          <span className="min-w-0">{itemLabel}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </SheetBody>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
}
