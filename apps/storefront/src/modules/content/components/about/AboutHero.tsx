import { buttonVariants, cn } from '@pk/ui';
import { ArrowDown, ArrowRight, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { AboutBackdrop } from './AboutBackdrop';

/**
 * Opening band on Deep Pine, matching the home hero: headline + both CTAs above the fold at 375 and
 * 1440, and a photo in an arched "window" frame instead of a second jar-on-plinth (that stays the
 * home page's signature). Server component — no client JS, static (D-51).
 */
export function AboutHero() {
  return (
    <section
      aria-labelledby="about-title"
      /* Pulled up under the floating header (76px / 80px), same as the home hero */
      className="relative isolate -mt-19 overflow-hidden bg-secondary pt-19 text-secondary-foreground md:-mt-20 md:pt-20"
    >
      <AboutBackdrop />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:pb-20 md:grid-cols-12 md:gap-8 md:px-8 md:pt-14 md:pb-24 lg:gap-16 lg:pt-16 lg:pb-28">
        <div className="grid gap-5 md:col-span-7 md:gap-6">
          <Breadcrumbs tone="inverse" className="-mt-3 md:-mt-6" items={[{ name: 'Our story', href: '/about' }]} />
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-secondary-foreground/10 bg-card/45 px-3.5 py-1.5 text-[0.6875rem] font-semibold tracking-[0.2em] text-primary uppercase shadow-sm backdrop-blur-sm dark:bg-secondary-foreground/5">
            <MapPin className="size-3.5" aria-hidden="true" />
            Our story · Himachal Pradesh
          </p>

          <h1
            id="about-title"
            className="font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance text-secondary-foreground sm:text-5xl md:text-[2.75rem] lg:text-6xl"
          >
            A Himachal kitchen, <span className="mt-1 block font-normal text-primary italic">a jar at a time.</span>
          </h1>

          <p className="max-w-md text-base leading-relaxed text-pretty text-secondary-foreground/85 md:text-lg lg:max-w-lg">
            Pahadi Khatki starts from the meat pickles Himachali families make before winter closes the passes — cooked
            slow, sealed under mustard oil, made in small batches.
          </p>

          <div id="about-hero-ctas" className="grid grid-cols-2 gap-3 pt-1 sm:flex sm:flex-wrap">
            <Link
              href="/products"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'band' }),
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
              href="#process"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-secondary-foreground/30 bg-secondary-foreground/5 px-5 text-secondary-foreground backdrop-blur-sm hover:border-secondary-foreground/60 hover:bg-secondary-foreground/10 hover:text-secondary-foreground focus-visible:ring-primary active:scale-[0.98] motion-reduce:active:scale-100 sm:px-7',
              )}
            >
              How it&rsquo;s made
              <ArrowDown aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Arched photo window with a gold hairline and a soft warm glow behind it */}
        <figure className="relative mx-auto w-full max-w-60 sm:max-w-72 md:col-span-5 md:max-w-sm">
          <div
            aria-hidden="true"
            className="absolute -inset-[14%] -z-10 bg-radial from-card/60 via-card/15 via-40% to-transparent to-70% dark:from-primary/25 dark:via-primary/8"
          />
          <div className="rounded-t-full border border-card/70 bg-card/25 p-2 shadow-2xl shadow-primary/20 backdrop-blur-sm dark:border-primary/30 dark:bg-transparent dark:shadow-none">
            <div className="relative aspect-4/5 overflow-hidden rounded-t-full rounded-b-lg">
              <Image
                src="/home/jar-elevated-spices.webp"
                alt="A jar of Pahadi Khatki pickle on slate, with garlic cloves and dried red chillies"
                fill
                sizes="(min-width: 1024px) 384px, (min-width: 768px) 40vw, (min-width: 640px) 288px, 240px"
                preload
                fetchPriority="high"
                className="object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-linear-to-t from-secondary-foreground/30 via-transparent to-transparent dark:from-secondary/55"
              />
            </div>
          </div>
          <figcaption className="mx-auto mt-3.5 w-fit rounded-full border border-secondary-foreground/10 bg-card/70 px-4 py-1.5 text-center text-xs text-muted-foreground shadow-float backdrop-blur-md dark:bg-secondary/85 dark:text-secondary-foreground/80">
            Garlic, sun-dried chillies, mustard oil — the hill pantry.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
