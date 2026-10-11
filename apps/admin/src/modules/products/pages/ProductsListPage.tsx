import { Button, Input, Tabs, TabsList, TabsTrigger } from '@pk/ui';
import { CircleCheck, FilePen, PackageOpen, PackageX, Plus, Search, ShoppingBasket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { KpiCard, KpiGrid } from '@/components/common/KpiCard';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common/StateBlocks';
import { TableCard } from '@/components/common/TableCard';
import { ProductsTable } from '../components/ProductsTable';
import { useProducts } from '../hooks/useProducts';

const FILTERS = ['all', 'live', 'draft', 'sold-out'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', live: 'Live', draft: 'Draft', 'sold-out': 'Sold out' };

export default function ProductsListPage() {
  const products = useProducts();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('status')) ?? 'all';
  const [query, setQuery] = useState('');

  const list = products.data;
  const counts = useMemo(() => {
    const all = list ?? [];
    return {
      all: all.length,
      live: all.filter((p) => p.isActive).length,
      draft: all.filter((p) => !p.isActive).length,
      'sold-out': all.filter((p) => p.isActive && p.stock.sellable === 0).length,
      blocked: all.filter((p) => !p.isActive && p.missingForPublish.length > 0).length,
      sellable: all.reduce((n, p) => n + p.stock.sellable, 0),
      onHand: all.reduce((n, p) => n + p.stock.onHand, 0),
    };
  }, [list]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? [])
      .filter((p) =>
        filter === 'live'
          ? p.isActive
          : filter === 'draft'
            ? !p.isActive
            : filter === 'sold-out'
              ? p.isActive && p.stock.sellable === 0
              : true,
      )
      .filter(
        (p) => !q || p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.productGroup.includes(q),
      )
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.productGroup.localeCompare(b.productGroup) || a.netWeightG - b.netWeightG,
      );
  }, [list, filter, query]);

  const setFilter = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'all') next.delete('status');
        else next.set('status', value);
        return next;
      },
      { replace: true },
    );

  const loading = products.isPending;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Every jar the storefront can sell — prices, FSSAI label data and photos. Drafts stay hidden until they pass the publish checklist."
        actions={
          <Button asChild>
            <Link to="/products/new">
              <Plus aria-hidden="true" />
              Add product
            </Link>
          </Button>
        }
      />

      <KpiGrid label="Catalog summary">
        <KpiCard
          label="Live"
          icon={CircleCheck}
          tone="success"
          loading={loading}
          value={counts.live}
          hint="Visible on the storefront"
        />
        <KpiCard
          label="Drafts"
          icon={FilePen}
          tone={counts.blocked > 0 ? 'warning' : 'default'}
          loading={loading}
          value={counts.draft}
          hint={counts.blocked > 0 ? `${counts.blocked} need info to publish` : 'Ready when you are'}
        />
        <KpiCard
          label="Sold out"
          icon={PackageX}
          tone={counts['sold-out'] > 0 ? 'destructive' : 'default'}
          loading={loading}
          value={counts['sold-out']}
          hint={counts['sold-out'] > 0 ? 'Live with 0 sellable jars' : 'Every live jar in stock'}
        />
        <KpiCard
          label="Sellable jars"
          icon={ShoppingBasket}
          loading={loading}
          value={counts.sellable}
          hint={`${counts.onHand} on hand in all batches`}
        />
      </KpiGrid>

      <TableCard
        label="Product list"
        controls={
          <>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList aria-label="Filter by status">
                {FILTERS.map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {FILTER_LABEL[f]}
                    {!loading && <span className="tabular-nums opacity-80">({counts[f]})</span>}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="relative md:w-72">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or SKU"
                aria-label="Search products"
                className="pl-10"
              />
            </div>
          </>
        }
        footer={
          list && list.length > 0 && visible.length > 0
            ? `Showing ${visible.length} of ${list.length} product${list.length === 1 ? '' : 's'}`
            : undefined
        }
      >
        {products.isPending ? (
          <ListSkeleton label="Loading products" />
        ) : products.isError ? (
          <ErrorState
            title="Couldn’t load products"
            message={products.error.message}
            onRetry={() => void products.refetch()}
            retrying={products.isFetching}
          />
        ) : products.data.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No products yet"
            description="Add your first pickle — it stays a draft until the lab shelf life, GST and photos are in."
            action={
              <Button asChild>
                <Link to="/products/new">
                  <Plus aria-hidden="true" />
                  Add product
                </Link>
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No products match"
            description="Try another name or SKU, or switch the status filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <ProductsTable products={visible} />
        )}
      </TableCard>
    </div>
  );
}
