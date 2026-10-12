import { formatINR, type AdminProduct } from '@pk/shared';
import { Button, NonVegMark, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pk/ui';
import { AlertCircle, ChevronRight, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { formatWeight, productStatus } from './productMeta';
import { ProductThumb } from './ProductThumb';
import { StockCell } from './StockCell';

function Price({ product }: { product: AdminProduct }) {
  return (
    <span className="grid gap-0.5 tabular-nums">
      <span className="font-semibold">{formatINR(product.pricePaise, { trimZeroPaise: true })}</span>
      {product.comparePricePaise != null && (
        <s className="text-xs text-muted-foreground">{formatINR(product.comparePricePaise, { trimZeroPaise: true })}</s>
      )}
    </span>
  );
}

function StatusCell({ product }: { product: AdminProduct }) {
  const missing = product.missingForPublish.length;
  return (
    <span className="grid justify-items-start gap-1">
      <StatusBadge status={productStatus(product)} />
      {!product.isActive && missing > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-warning">
          <AlertCircle aria-hidden="true" className="size-3.5" />
          {missing} to fill before publishing
        </span>
      )}
    </span>
  );
}

/** lg+: dense table (scrolls inside its own container). Phones + tablets: tappable cards. */
export function ProductsTable({ products }: { products: AdminProduct[] }) {
  return (
    <>
      <ul className="divide-y divide-border lg:hidden">
        {products.map((p) => (
          <li key={p.id}>
            <Link
              to={`/products/${p.id}`}
              className="flex items-center gap-3 px-5 py-3.5 outline-none hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <ProductThumb product={p} className="size-14" />
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <NonVegMark size="sm" />
                  <span className="truncate font-medium">{p.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.sku} · {formatWeight(p.netWeightG)} · {formatINR(p.pricePaise, { trimZeroPaise: true })}
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge status={productStatus(p)} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    <span
                      className={
                        p.stock.sellable === 0 ? 'font-semibold text-destructive' : 'font-semibold text-foreground'
                      }
                    >
                      {p.stock.sellable}
                    </span>{' '}
                    sellable · {p.stock.onHand} on hand
                  </span>
                </span>
                {!p.isActive && p.missingForPublish.length > 0 && (
                  <span className="text-xs text-warning">{p.missingForPublish.length} to fill before publishing</span>
                )}
              </div>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      <Table
        aria-label="Products"
        containerClassName="hidden lg:block"
        className="[&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5"
      >
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Product</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="min-w-64">
                <div className="flex items-center gap-3">
                  <ProductThumb product={p} />
                  <div className="grid min-w-0 gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <NonVegMark size="sm" />
                      <Link
                        to={`/products/${p.id}`}
                        className="truncate font-medium outline-none hover:underline focus-visible:underline"
                      >
                        {p.title}
                      </Link>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {p.productGroup} · {formatWeight(p.netWeightG)}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs tracking-wide">{p.sku}</span>
              </TableCell>
              <TableCell className="text-right">
                <Price product={p} />
              </TableCell>
              <TableCell className="min-w-36">
                <StockCell stock={p.stock} />
              </TableCell>
              <TableCell className="min-w-40">
                <StatusCell product={p} />
              </TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm" className="h-11">
                  <Link to={`/products/${p.id}`} aria-label={`Edit ${p.title}`}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
