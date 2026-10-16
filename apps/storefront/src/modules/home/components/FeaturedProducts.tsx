import type { ProductListResponse } from '@pk/shared';
import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, CloudOff, Hourglass, PackageCheck, Sparkles, Truck } from 'lucide-react';
import Link from 'next/link';
import { StateMessage } from '@/components/common/StateMessage';
import { ProductGrid } from '@/modules/catalog';

/** `groups === null` → the catalogue couldn't be loaded (error state, page still renders). */
export function FeaturedProducts({ groups }: { groups: ProductListResponse['groups'] | null }) {
  return (
    <section aria-labelledby="featured-title" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
      <div className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wider text-accent-foreground uppercase">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Seasonal Small-Batch
          </span>
          <h2 id="featured-title" className="mt-3 font-serif text-3xl font-medium text-foreground sm:text-4xl">
            Artisanal Non-Veg Pickles
          </h2>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Handcrafted with freshly sourced meat, cold-pressed mustard oil, and mountain spices. Available in 250 g
            table jars and 500 g family jars.
          </p>
        </div>

        {groups && groups.length > 0 && (
          <Link
            href="/products"
            className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'group shrink-0 self-start md:self-auto')}
          >
            Explore All Recipes
            <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-1" />
          </Link>
        )}
      </div>

      <div className="mt-10">
        {groups === null ? (
          <StateMessage
            tone="error"
            icon={<CloudOff />}
            title="Our pantry is taking a breather"
            description="We couldn't load the pickles just now. Please refresh in a moment."
            action={
              <Link href="/products" className={buttonVariants({ variant: 'outline' })}>
                Try the shop page
              </Link>
            }
          />
        ) : groups.length === 0 ? (
          <StateMessage
            icon={<Hourglass />}
            title="The next batch is curing"
            description="Our first jars of the season are still maturing. Check back soon."
          />
        ) : (
          <ProductGrid groups={groups.slice(0, 3)} />
        )}
      </div>

      {/* Trust & Dispatch Guarantee Bar */}
      <div className="mt-14 grid gap-4 rounded-xl border border-border bg-card p-6 sm:grid-cols-3 sm:gap-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <PackageCheck className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Leakproof Glass Packaging</h3>
            <p className="text-xs text-muted-foreground">Double-sealed with custom shock-absorbent cushioning.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Truck className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Tracked Nationwide Delivery</h3>
            <p className="text-xs text-muted-foreground">Direct from Himachal to 19,000+ pincodes in India.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">100% Pure & Untouched</h3>
            <p className="text-xs text-muted-foreground">Zero artificial colors, vinegars, or preservatives.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
