/** Public API of the cart module (D-15) — other modules and app/ routes import only from here. */
export { AddToCartButton, type AddToCartProduct } from './components/AddToCartButton';
export { CartButton } from './components/CartButton';
export { CartRoot } from './components/CartRoot';
export { openCart } from './store/cart-ui.store';
export { CART_STORAGE_KEY, useCartStore, type CartItem } from './store/cart.store';
export { useCartQuote, noticeFor, cartKeys } from './hooks/useCartQuote';
