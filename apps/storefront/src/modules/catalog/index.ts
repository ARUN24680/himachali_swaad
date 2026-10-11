/** Public API of the catalog module — app/ routes and other modules import only from here. */
export { catalogApi } from './api/catalogApi';
export { ProductCard } from './components/ProductCard';
export { ProductGrid, ProductGridSkeleton } from './components/ProductGrid';
export { ProductDetailView } from './components/ProductDetailView';
export { StockBadge } from './components/StockBadge';
export { MEAT_LABEL, formatDate, formatWeight, stockLabel } from './lib/format';
export { CatalogListing, CatalogListingSkeleton } from './components/CatalogListing';
export { CatalogUnavailable } from './components/CatalogUnavailable';
