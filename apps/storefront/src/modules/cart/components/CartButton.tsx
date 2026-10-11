'use client';

import { Button } from '@pk/ui';
import { ShoppingBag } from 'lucide-react';
import { selectCartCount, useCartStore } from '../store/cart.store';
import { useCartUiStore } from '../store/cart-ui.store';

/** Header bag with live jar count. The badge re-mounts on every add (`pulse`) to replay its pop animation. */
export function CartButton() {
  const count = useCartStore(selectCartCount);
  const hydrated = useCartStore((s) => s.hydrated);
  const pulse = useCartUiStore((s) => s.pulse);
  const setOpen = useCartUiStore((s) => s.setOpen);
  const shown = hydrated ? count : 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={shown === 0 ? 'Cart, empty' : `Cart, ${shown} ${shown === 1 ? 'jar' : 'jars'}`}
      onClick={() => setOpen(true)}
      data-testid="cart-button"
    >
      <ShoppingBag aria-hidden="true" className="size-5!" />
      {shown > 0 && (
        <span
          key={pulse}
          aria-hidden="true"
          className="absolute top-1 right-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-5 font-bold text-primary-foreground tabular-nums motion-safe:animate-in motion-safe:duration-300 motion-safe:zoom-in-50"
        >
          {shown > 99 ? '99+' : shown}
        </span>
      )}
    </Button>
  );
}
