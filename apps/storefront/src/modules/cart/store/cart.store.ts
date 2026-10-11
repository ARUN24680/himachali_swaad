import { MAX_CART_LINES, type CartItemInput } from '@pk/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Guest cart (D-15): ONLY `{ productId, quantity }` is stored — prices and stock always come from
 * POST /cart/quote, never from here. Persisted under the versioned key `pk-cart-v1`.
 *
 * `skipHydration` keeps the server render and first client render identical (empty cart); CartRoot
 * rehydrates after mount and on `storage` events from other tabs.
 */
export const CART_STORAGE_KEY = 'pk-cart-v1';
/** Hard ceiling before the server's `maxQtyPerItem` is known (CartItemInputSchema max). */
export const FALLBACK_MAX_QTY = 10;

export type CartItem = CartItemInput;

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  add: (productId: string, quantity?: number, maxQty?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  /** Undo a removal at its original position. */
  restore: (item: CartItem, index: number) => void;
  clear: () => void;
}

const clampQty = (q: number, max: number) => Math.max(1, Math.min(max, Math.trunc(q)));

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      add: (productId, quantity = 1, maxQty = FALLBACK_MAX_QTY) =>
        set(({ items }) => {
          const existing = items.find((i) => i.productId === productId);
          if (existing) {
            return {
              items: items.map((i) =>
                i.productId === productId ? { ...i, quantity: clampQty(i.quantity + quantity, maxQty) } : i,
              ),
            };
          }
          if (items.length >= MAX_CART_LINES) return { items };
          return { items: [...items, { productId, quantity: clampQty(quantity, maxQty) }] };
        }),
      setQuantity: (productId, quantity) =>
        set(({ items }) => ({
          items: items.map((i) => (i.productId === productId ? { ...i, quantity: clampQty(quantity, 99) } : i)),
        })),
      remove: (productId) => set(({ items }) => ({ items: items.filter((i) => i.productId !== productId) })),
      restore: (item, index) =>
        set(({ items }) => {
          if (items.some((i) => i.productId === item.productId)) return { items };
          const next = [...items];
          next.splice(Math.min(index, next.length), 0, item);
          return { items: next };
        }),
      clear: () => set({ items: [] }),
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ items: s.items }),
      // Defensive: drop anything that isn't {productId, quantity} (old/edited storage)
      merge: (persisted, current) => {
        const raw = (persisted as { items?: unknown } | undefined)?.items;
        const items = Array.isArray(raw)
          ? raw
              .filter(
                (i): i is CartItem =>
                  typeof i === 'object' &&
                  i !== null &&
                  typeof (i as CartItem).productId === 'string' &&
                  Number.isInteger((i as CartItem).quantity) &&
                  (i as CartItem).quantity > 0,
              )
              .slice(0, MAX_CART_LINES)
              .map((i) => ({ productId: i.productId, quantity: Math.min(i.quantity, 99) }))
          : [];
        return { ...current, items };
      },
      onRehydrateStorage: () => () => useCartStore.setState({ hydrated: true }),
    },
  ),
);

export const selectCartCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
