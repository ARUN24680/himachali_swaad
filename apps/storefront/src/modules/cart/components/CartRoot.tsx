'use client';

import { useEffect } from 'react';
import { CART_STORAGE_KEY, useCartStore } from '../store/cart.store';
import { CartDrawer } from './CartDrawer';

/** Mounted once in the root layout: restores the persisted cart after hydration and keeps tabs in sync. */
export function CartRoot() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_STORAGE_KEY) void useCartStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return <CartDrawer />;
}
