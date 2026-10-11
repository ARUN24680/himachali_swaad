import type { AdminProduct, MeatType, PublishRequirement } from '@pk/shared';

/** Human labels for publish blockers + the form section that fixes each one. */
export const REQUIREMENT_LABEL: Record<PublishRequirement, { label: string; section: string }> = {
  gstRateBp: { label: 'GST rate', section: 'pricing' },
  shelfLifeDays: { label: 'Shelf life (lab tested)', section: 'food-safety' },
  ingredients: { label: 'Ingredients list', section: 'food-safety' },
  nutrition: { label: 'Nutrition per 100 g', section: 'food-safety' },
  packedWeightG: { label: 'Packed weight', section: 'shipping' },
  images: { label: 'At least one photo', section: 'images' },
};

export const MEAT_LABEL: Record<MeatType, string> = {
  CHICKEN: 'Chicken',
  MUTTON: 'Mutton',
  FISH: 'Fish',
  PRAWN: 'Prawn',
};

export type ProductStatus = 'LIVE' | 'DRAFT';
export const productStatus = (p: Pick<AdminProduct, 'isActive'>): ProductStatus => (p.isActive ? 'LIVE' : 'DRAFT');

export const formatWeight = (g: number) => (g >= 1000 && g % 1000 === 0 ? `${g / 1000} kg` : `${g} g`);
