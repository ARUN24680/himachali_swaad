import type { ProductListResponse } from '@pk/shared';
import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, Check, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { formatDate } from '@/modules/catalog';
import { HeroBackdrop } from './HeroBackdrop';

/** Facts the store actually delivers on (no ratings, counts or certifications we can't back). */
const TRUST = ['Cold-pressed mustard oil', 'No added preservatives', 'Batch-coded jars', 'Prepaid, tracked delivery'];

/**
 * Editorial hero on the Deep Pine band. The jar stands on a lit plinth inside a soft arch of warm
 * light (no disc, no card), with the fresh-batch label tucked under its base. Server component (no
 * client JS, D-51 static rendering): headline and both CTAs sit above the fold at 375 and 1440.
 */
export function HomeHero({
  freshestBatch,
  heroImage = '/home/heritage-jar.webp',
  heroAlt = 'A glass jar of Pahadi Khatki pickle, pieces steeped in mustard oil',
}: {
  freshestBatch?: ProductListResponse['freshestBatch'] | null;
  heroImage?: string;
  heroAlt?: string;
}) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-secondary text-secondary-foreground"
    >
      <HeroBackdrop />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:pb-20 md:grid-cols-12 md:gap-8 md:px-8 md:pt-14 md:pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:pt-16 lg:pb-28">
        <div className="grid gap-5 md:col-span-7 md:gap-6 lg:col-span-1">
          <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            <MapPin className="size-3.5" aria-hidden="true" />
            Small-batch · Himachal Pradesh
          </p>

          <h1
            id="hero-title"
            className="font-serif text-4xl leading-[1.06] font-medium tracking-tight text-balance sm:text-5xl md:text-4xl lg:text-5xl"
          >
            Taste the mountains, <span className="block text-primary">slow-cooked in small batches.</span>
          </h1>

          <p className="max-w-md text-base leading-relaxed text-pretty text-secondary-foreground/80 md:text-lg lg:max-w-lg">
            Chicken, mutton and trout pickles simmered in cold-pressed mustard oil with hand-pounded Pahadi spices —
            sealed in glass.
          </p>

          <div id="hero-ctas" className="grid grid-cols-2 gap-3 pt-1 sm:flex sm:flex-wrap">
            <Link
              href="/products"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'group px-5 shadow-lg shadow-primary/25 transition-[transform,box-shadow] hover:shadow-xl hover:shadow-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 sm:px-7',
              )}
            >
              Shop pickles
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </Link>
            <Link
              href="/about"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-secondary-foreground/30 bg-secondary-foreground/5 px-5 text-secondary-foreground backdrop-blur-sm hover:border-secondary-foreground/60 hover:bg-secondary-foreground/10 hover:text-secondary-foreground focus-visible:ring-primary active:scale-[0.98] motion-reduce:active:scale-100 sm:px-7',
              )}
            >
              Our story
            </Link>
          </div>

          <ul className="mt-1 grid max-w-lg grid-cols-2 gap-x-3 gap-y-2.5 border-t border-secondary-foreground/10 pt-5 text-xs text-secondary-foreground/80 sm:gap-x-6 sm:text-sm md:gap-x-4 md:text-xs lg:gap-x-6 lg:text-sm">
            {TRUST.map((t) => (
              <li key={t} className="flex items-start gap-1.5 sm:gap-2">
                <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-primary/15 sm:mt-0.5">
                  <Check className="size-3 text-primary" strokeWidth={3} aria-hidden="true" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Product stage: warm light arch → jar → lit plinth with a contact shadow → batch label */}
        <div className="relative mx-auto w-full max-w-64 sm:max-w-xs md:col-span-5 md:max-w-none lg:col-span-1">
          <div
            aria-hidden="true"
            className="absolute -inset-[12%] -z-10 bg-radial from-primary/25 via-primary/8 via-40% to-transparent to-70%"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-[6%] top-[-9%] bottom-[10%] -z-10 rounded-t-full border border-b-0 border-primary/20 bg-linear-to-b from-secondary-foreground/8 to-transparent mask-b-from-55%"
          />

          <div className="relative aspect-square w-full">
            {/* Plinth: a lit ellipse the jar stands on, with a gold rim catching the light */}
            <div
              aria-hidden="true"
              className="absolute inset-x-[4%] -bottom-[5%] h-[14%] rounded-[50%] border-t border-primary/30 bg-linear-to-b from-secondary-foreground/12 to-secondary-foreground/2"
            />
            {/* Contact shadow where the glass meets the plinth */}
            <div
              aria-hidden="true"
              className="absolute inset-x-[16%] -bottom-[1.5%] h-[6%] rounded-[50%] bg-secondary blur-md dark:bg-background/80"
            />
            <Image
              src={heroImage}
              alt={heroAlt}
              fill
              sizes="(min-width: 1024px) 420px, (min-width: 768px) 280px, (min-width: 640px) 320px, 256px"
              preload
              fetchPriority="high"
              className="object-contain drop-shadow-2xl"
            />
          </div>

          {freshestBatch && (
            <p
              className="relative z-10 mx-auto mt-3 grid w-fit max-w-[92%] justify-items-center gap-0.5 rounded-2xl border border-secondary-foreground/15 bg-secondary/85 px-4 py-2 text-center text-xs text-secondary-foreground/80 shadow-float backdrop-blur-md"
              data-testid="current-batch"
            >
              <span className="flex flex-wrap items-center justify-center gap-x-2">
                <span className="size-1.5 shrink-0 rounded-full bg-success ring-2 ring-success/25" aria-hidden="true" />
                <span className="font-semibold text-secondary-foreground">Fresh batch</span>
                <span className="font-mono font-semibold tracking-wide text-primary tabular-nums">
                  {freshestBatch.batchCode}
                </span>
              </span>
              <span className="text-balance">
                {freshestBatch.productTitle} · bottled {formatDate(freshestBatch.manufacturedAt)}
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
