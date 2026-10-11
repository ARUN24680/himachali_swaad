import type { ProductListResponse } from '@pk/shared';
import { Badge, buttonVariants, cn } from '@pk/ui';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { JarIllustration, MountainRidges } from '@/components/common/MountainRidges';
import { ProductImage } from '@/components/common/ProductImage';
import { formatDate } from '@/modules/catalog';

/**
 * Deep-pine editorial hero with a token-drawn Dhauladhar ridge (no photography yet). Every box has a
 * fixed size/aspect → zero CLS. The current-batch stamp is real data and disappears when null.
 */
export function HomeHero({
  freshestBatch,
  heroImage,
  heroAlt,
}: {
  freshestBatch: ProductListResponse['freshestBatch'];
  heroImage: string | null;
  heroAlt: string;
}) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-secondary text-secondary-foreground"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-32 md:grid-cols-[1.15fr_0.85fr] md:px-8 md:pt-16 md:pb-48 lg:pt-20">
        <div className="grid gap-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">From a Himachal kitchen</p>
          <h1 id="hero-title" className="font-serif text-4xl leading-[1.05] font-medium sm:text-5xl lg:text-6xl">
            Taste the mountains, one small batch at a time.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-secondary-foreground/85 md:text-lg">
            Chicken, mutton and trout pickles slow-cooked in cold-pressed mustard oil with hand-pounded pahadi spices —
            the way Himachali homes have always made them.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/products" className={cn(buttonVariants({ size: 'lg' }), 'group')}>
              Taste the Mountains
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
            <Link
              href="/about"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-secondary-foreground/30 text-secondary-foreground hover:bg-secondary-foreground/10',
              )}
            >
              Our story
            </Link>
          </div>
          {freshestBatch && (
            <p
              className="flex flex-wrap items-center gap-2 text-sm text-secondary-foreground/85"
              data-testid="current-batch"
            >
              <span className="font-medium text-secondary-foreground">Current batch</span>
              <Badge tone="primary" className="tracking-[0.06em] tabular-nums">
                {freshestBatch.batchCode}
              </Badge>
              <span>
                {freshestBatch.productTitle} · made {formatDate(freshestBatch.manufacturedAt)}
              </span>
            </p>
          )}
        </div>

        <div className="relative mx-auto w-full max-w-60 sm:max-w-80 md:max-w-none">
          <div
            className="absolute -inset-4 -z-10 rounded-t-full border border-secondary-foreground/15"
            aria-hidden="true"
          />
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-full border border-secondary-foreground/20 bg-muted shadow-float">
            {heroImage ? (
              <ProductImage
                src={heroImage}
                alt={heroAlt}
                sizes="(min-width: 768px) 40vw, (min-width: 640px) 320px, 240px"
                priority
                className="absolute inset-0 aspect-auto h-full"
              />
            ) : (
              <JarIllustration label={heroAlt} />
            )}
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 md:h-48 lg:h-56" aria-hidden="true">
        <MountainRidges />
      </div>
    </section>
  );
}
