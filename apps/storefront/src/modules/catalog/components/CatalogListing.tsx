import type { ProductListResponse } from '@pk/shared';
import { Leaf, Hourglass, ScanLine, Truck } from 'lucide-react';
import { SectionHeading } from '@/components/common/SectionHeading';
import { StateMessage } from '@/components/common/StateMessage';
import { ProductGrid, ProductGridSkeleton } from './ProductGrid';

function ListingHeader() {
  return (
    <div className="grid gap-6">
      <SectionHeading
        as="h1"
        eyebrow="The pantry"
        title="Himachali non-veg pickles"
        lead="Slow-cooked in cold-pressed mustard oil, matured in small batches and sealed with a batch code. Pick a 250 g table jar or a 500 g family jar."
      />
      <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Why our pickles">
        {[
          { icon: <Leaf />, label: 'No added preservatives' },
          { icon: <ScanLine />, label: 'Batch-coded jars' },
          { icon: <Truck />, label: 'Prepaid, tracked delivery' },
        ].map((c) => (
          <li
            key={c.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 [&_svg]:size-3.5 [&_svg]:text-accent-foreground"
          >
            <span aria-hidden="true">{c.icon}</span>
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** /products — every product group as one card (Phase 4 §4.4). */
export function CatalogListing({ groups }: { groups: ProductListResponse['groups'] }) {
  const visible = groups.filter((g) => g.variants.length > 0);
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:px-8 md:py-14">
      <ListingHeader />
      {visible.length === 0 ? (
        <StateMessage
          icon={<Hourglass />}
          title="The next batch is curing"
          description="Every jar from our last batch has found a home. New jars are maturing in the kitchen — please check back soon."
        />
      ) : (
        <ProductGrid groups={visible} priorityCount={3} />
      )}
    </div>
  );
}

export function CatalogListingSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:px-8 md:py-14">
      <ListingHeader />
      <ProductGridSkeleton count={6} />
    </div>
  );
}
