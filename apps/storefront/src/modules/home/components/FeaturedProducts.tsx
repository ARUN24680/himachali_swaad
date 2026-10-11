import type { ProductListResponse } from '@pk/shared';
import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, CloudOff, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { SectionHeading } from '@/components/common/SectionHeading';
import { StateMessage } from '@/components/common/StateMessage';
import { ProductGrid } from '@/modules/catalog';

/** `groups === null` → the catalogue couldn't be loaded (error state, page still renders). */
export function FeaturedProducts({ groups }: { groups: ProductListResponse['groups'] | null }) {
  return (
    <section aria-labelledby="featured-title" className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
      <SectionHeading
        id="featured-title"
        eyebrow="This season's jars"
        title="Pickles from the hills"
        lead="Each recipe comes in a 250 g table jar and a 500 g family jar."
        action={
          groups && groups.length > 0 ? (
            <Link href="/products" className={cn(buttonVariants({ variant: 'outline' }), 'w-fit')}>
              See all pickles
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
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
    </section>
  );
}
