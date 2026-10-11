import { sumPaise, multiplyPaise, type CartItemInput, type CartQuoteLine, type CartQuoteResponse } from '@pk/shared';
import { z } from 'zod';
import type { Db, Queryable } from '../../config/db';
import type { CatalogService } from '../catalog/catalog.service';
import type { SettingsService } from '../settings/settings.service';

const NullablePaise = z.number().int().nonnegative().nullable();
const MaxQty = z.number().int().min(1).max(99);

/**
 * Server-side cart pricing (D-15). The browser cart holds only {productId, quantity}; every
 * price, stock cap and shipping fee comes from here. Phase 5 createOrder() re-runs quoteCart()
 * inside its transaction, so what the drawer shows is what checkout charges.
 */
export function createCartService(deps: { db: Db; catalog: CatalogService; settings: SettingsService }) {
  const { db, catalog, settings } = deps;

  async function quoteCart(items: CartItemInput[], q: Queryable = db): Promise<CartQuoteResponse> {
    // Same product twice → one line (quantities add up)
    const merged = new Map<string, number>();
    for (const item of items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);

    const [products, maxQty, threshold, flatFee] = await Promise.all([
      catalog.productsForQuote(q, [...merged.keys()]),
      settings.getSetting(q, 'max_qty_per_item', MaxQty),
      settings.getSetting(q, 'free_shipping_threshold_paise', NullablePaise),
      settings.getSetting(q, 'flat_shipping_fee_paise', NullablePaise),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));

    const lines: CartQuoteLine[] = [...merged].map(([productId, requested]) => {
      const p = byId.get(productId);
      if (!p || !p.isActive) {
        return {
          productId,
          slug: p?.slug ?? null,
          title: p?.title ?? null,
          netWeightG: p?.netWeightG ?? null,
          image: p?.image ?? null,
          unitPricePaise: p?.pricePaise ?? 0,
          comparePricePaise: p?.comparePricePaise ?? null,
          requestedQuantity: requested,
          quantity: 0,
          availableQuantity: 0,
          lineTotalPaise: 0,
          issue: 'INACTIVE',
        };
      }
      const quantity = Math.min(requested, p.sellableStock, maxQty);
      return {
        productId,
        slug: p.slug,
        title: p.title,
        netWeightG: p.netWeightG,
        image: p.image,
        unitPricePaise: p.pricePaise,
        comparePricePaise: p.comparePricePaise,
        requestedQuantity: requested,
        quantity,
        availableQuantity: p.sellableStock,
        lineTotalPaise: multiplyPaise(p.pricePaise, quantity),
        issue: p.sellableStock === 0 ? 'OUT_OF_STOCK' : quantity < requested ? 'QTY_REDUCED' : null,
      };
    });

    const subtotalPaise = sumPaise(lines.map((l) => l.lineTotalPaise));
    // Q-03 undecided → both settings null → no shipping fee charged and no progress bar
    const freeShipping = threshold !== null && subtotalPaise >= threshold;
    const shippingFeePaise = subtotalPaise === 0 || freeShipping ? 0 : (flatFee ?? 0);
    const discountPaise = 0; // coupons are v2
    return {
      items: lines,
      subtotalPaise,
      shippingFeePaise,
      discountPaise,
      totalPaise: subtotalPaise + shippingFeePaise - discountPaise,
      freeShippingThresholdPaise: threshold,
      freeShippingRemainingPaise: threshold === null ? null : Math.max(0, threshold - subtotalPaise),
      maxQtyPerItem: maxQty,
    };
  }

  return { quoteCart };
}

export type CartService = ReturnType<typeof createCartService>;
