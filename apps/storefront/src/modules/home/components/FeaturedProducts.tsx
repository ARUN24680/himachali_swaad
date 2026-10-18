import type { ProductListResponse } from '@pk/shared';
import { Skeleton, buttonVariants, cn } from '@pk/ui';
import { ArrowRight, CloudOff, Hourglass, PackageCheck, ScanLine, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StateMessage } from '@/components/common/StateMessage';
import { ProductCard } from '@/modules/catalog';

const MAX_ON_HOME = 3;

const PROMISES: { icon: ReactNode; title: string; body: string }[] = [
  { icon: <PackageCheck />, title: 'Leak-proof glass packing', body: 'Sealed jars, cushioned for the journey.' },
  { icon: <Truck />, title: 'Tracked delivery across India', body: 'Shipped from the hills, tracked to your door.' },
  { icon: <ScanLine />, title: 'Batch-coded & dated', body: 'Batch, bottling and best-before on every jar.' },
];

/**
 * Lays the cards out as a swipeable rail on phones/tablets (one card + a peek, scroll-snap) and a
 * 3-column grid on desktop, so the shop sits high on the page without a tall single-column stack.
 */
const LIST =
  'flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0';
const ITEM = 'shrink-0 basis-4/5 snap-start sm:basis-5/12 lg:basis-auto';

/** Quick shop, right after the hero. `groups === null` → the catalogue couldn't be loaded. */
export function FeaturedProducts({ groups }: { groups: ProductListResponse['groups'] | null }) {
  const shown = groups?.filter((g) => g.variants.length > 0).slice(0, MAX_ON_HOME) ?? null;

  return (
    <section id="shop" aria-labelledby="featured-title" className="scroll-mt-20 pt-8 pb-12 md:pt-10 md:pb-16">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">Shop the pantry</p>
            <h2
              id="featured-title"
              className="font-serif text-3xl leading-tight font-medium text-foreground md:text-4xl"
            >
              Our non-veg pickles
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              250 g and 500 g glass jars · MRP inclusive of all taxes
            </p>
          </div>
          {shown && shown.length > 0 && (
            <Link
              href="/products"
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'group shrink-0 px-2 text-accent-foreground hover:text-accent-foreground sm:px-4',
              )}
            >
              View all
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-6xl md:mt-8 lg:px-8">
        {shown === null ? (
          <div className="px-4 lg:px-0">
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
          </div>
        ) : shown.length === 0 ? (
          <div className="px-4 lg:px-0">
            <StateMessage
              icon={<Hourglass />}
              title="The next batch is curing"
              description="Our first jars of the season are still maturing. Check back soon."
            />
          </div>
        ) : (
          <ul aria-label="Featured pickles" className={LIST}>
            {shown.map((g) => (
              <li key={g.productGroup} className={ITEM}>
                <ProductCard
                  variants={g.variants}
                  compact
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 42vw, 80vw"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-6xl px-4 md:mt-10 md:px-8">
        <ul className="grid gap-4 border-y border-border py-5 sm:grid-cols-3 sm:gap-6">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground [&_svg]:size-5"
              >
                {p.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Same footprint as the quick-shop rail/grid — used by the home loading shell. */
export function FeaturedProductsSkeleton() {
  return (
    <div className="pt-8 pb-12 md:pt-10 md:pb-16">
      <div className="mx-auto grid max-w-6xl gap-2 px-4 md:px-8">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <ul role="status" aria-label="Loading pickles" className={cn(LIST, 'mx-auto mt-6 max-w-6xl md:mt-8 lg:px-8')}>
        {Array.from({ length: MAX_ON_HOME }, (_, i) => (
          <li key={i} className={cn(ITEM, 'overflow-hidden rounded-lg border border-border bg-card')}>
            <Skeleton className="aspect-4/3 rounded-none" />
            <div className="grid gap-2 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-12 w-32" />
              </div>
              <Skeleton className="h-11 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
