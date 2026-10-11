'use client';

import { Button, cn, type ButtonProps } from '@pk/ui';
import { Check, ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { trackAddToCart } from '@/modules/analytics';
import { useCartStore } from '../store/cart.store';
import { useCartUiStore } from '../store/cart-ui.store';

export interface AddToCartProduct {
  productId: string;
  title: string;
  netWeightG: number;
  pricePaise: number;
  soldOut: boolean;
}

/**
 * Instant local add (D-15 — no network round-trip, no useOptimistic). Micro-interaction: the label
 * flips to "Added" with a check for a moment and the header bag pulses; screen readers hear it too.
 */
export function AddToCartButton({
  product,
  quantity = 1,
  onAdded,
  className,
  size = 'md',
  label = 'Add to cart',
}: {
  product: AddToCartProduct;
  quantity?: number;
  onAdded?: () => void;
  className?: string;
  size?: ButtonProps['size'];
  label?: string;
}) {
  const add = useCartStore((s) => s.add);
  const bump = useCartUiStore((s) => s.bump);
  const [added, setAdded] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onClick = () => {
    add(product.productId, quantity);
    bump();
    setAdded(true);
    setAnnouncement(`Added ${quantity} × ${product.title} ${product.netWeightG} g to your cart`);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1600);
    trackAddToCart({
      productId: product.productId,
      name: product.title,
      variant: `${product.netWeightG} g`,
      unitPricePaise: product.pricePaise,
      quantity,
    });
    onAdded?.();
  };

  return (
    <>
      <Button
        type="button"
        size={size}
        disabled={product.soldOut}
        onClick={onClick}
        className={cn('relative overflow-hidden', className)}
        data-state={added ? 'added' : 'idle'}
      >
        {product.soldOut ? (
          'Sold out'
        ) : added ? (
          <>
            <Check aria-hidden="true" className="motion-safe:animate-in motion-safe:zoom-in-50" />
            Added
          </>
        ) : (
          <>
            <ShoppingBag aria-hidden="true" />
            {label}
          </>
        )}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
