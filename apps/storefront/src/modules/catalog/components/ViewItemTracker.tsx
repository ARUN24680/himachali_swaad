'use client';

import { useEffect } from 'react';
import { trackViewItem, type TrackedItem } from '@/modules/analytics';

/** Fires view_item / ViewContent once per product page view (no-op without consent). */
export function ViewItemTracker({ item }: { item: TrackedItem }) {
  const { productId } = item;
  useEffect(() => {
    trackViewItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per product, not per render
  }, [productId]);
  return null;
}
