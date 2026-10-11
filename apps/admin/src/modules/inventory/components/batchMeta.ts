import type { MovementType, ShelfStatus } from '@pk/shared';

export const SHELF_LABEL: Record<ShelfStatus, string> = {
  FRESH: 'Fresh',
  AGING: 'Sell first',
  NOT_SELLABLE: 'Not sellable',
  EXPIRED: 'Expired',
};

export const SHELF_HELP: Record<ShelfStatus, string> = {
  FRESH: 'Plenty of shelf life left',
  AGING: 'Still sellable — push these first',
  NOT_SELLABLE: 'Too close to expiry to ship (hidden from storefront)',
  EXPIRED: 'Past expiry — log as wastage',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  PRODUCTION: 'Produced',
  RESERVE: 'Reserved for order',
  RELEASE: 'Released back',
  ADJUSTMENT: 'Correction',
  WASTAGE: 'Wastage',
};

export function expiryText(daysToExpiry: number): string {
  if (daysToExpiry > 1) return `${daysToExpiry} days left`;
  if (daysToExpiry === 1) return '1 day left';
  if (daysToExpiry === 0) return 'Expired today';
  return `Expired ${-daysToExpiry} day${daysToExpiry === -1 ? '' : 's'} ago`;
}
