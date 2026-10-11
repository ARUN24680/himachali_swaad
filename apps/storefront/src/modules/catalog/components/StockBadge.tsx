import type { StockBadge as StockBadgeValue } from '@pk/shared';
import { StatusBadge } from '@pk/ui';
import { stockLabel } from '../lib/format';

export function StockBadge({
  badge,
  sellable,
  className,
}: {
  badge: StockBadgeValue;
  sellable: number;
  className?: string;
}) {
  return <StatusBadge status={badge} label={stockLabel(badge, sellable)} className={className} />;
}
