import { NonVegMark, buttonVariants, cn } from '@pk/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Closing call to shop: a rounded Deep Pine card (same surface as the home story band) with the
 * jar on a lit plinth beside the CTA. Copy only repeats facts the store already states.
 */
export function AboutClosing() {
  return (
    <section aria-labelledby="about-cta-title" className="px-4 pb-16 md:px-8 md:pb-20">
      <div
        id="about-cta"
        className="relative isolate mx-auto grid max-w-6xl items-center gap-8 overflow-hidden rounded-2xl bg-secondary px-6 py-10 text-secondary-foreground sm:px-10 md:grid-cols-12 md:gap-6 md:py-12 lg:px-14"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-radial-[ellipse_at_85%_60%] from-primary/20 via-primary/5 via-35% to-transparent to-65%"
        />

        <div className="grid gap-5 md:col-span-8 lg:col-span-7">
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">From our kitchen to yours</p>
          <h2 id="about-cta-title" className="font-serif text-3xl leading-tight font-medium text-balance md:text-4xl">
            Taste the mountains.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-secondary-foreground/80">
            Chicken, mutton and fish pickles in 250 g and 500 g jars — prepaid, with tracked delivery.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/products"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'group px-7 shadow-lg shadow-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-secondary active:scale-[0.98] motion-reduce:active:scale-100',
              )}
            >
              Shop pickles
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </Link>
            <Link
              href="/faq"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-secondary-foreground/30 bg-secondary-foreground/5 px-7 text-secondary-foreground hover:border-secondary-foreground/60 hover:bg-secondary-foreground/10 hover:text-secondary-foreground focus-visible:ring-primary active:scale-[0.98] motion-reduce:active:scale-100',
              )}
            >
              Read the FAQ
            </Link>
          </div>
          <p className="flex items-center gap-2 text-sm text-secondary-foreground/75">
            <NonVegMark size="md" />
            All our products are non-vegetarian.
          </p>
        </div>

        {/* Jar on a lit plinth — hidden on phones to keep the CTA card short */}
        <div
          aria-hidden="true"
          className="relative mx-auto hidden w-full max-w-56 md:col-span-4 md:block lg:col-span-5 lg:max-w-64"
        >
          <div className="relative aspect-square w-full">
            <div className="absolute inset-x-[6%] -bottom-[4%] h-[13%] rounded-[50%] border-t border-primary/30 bg-linear-to-b from-secondary-foreground/12 to-secondary-foreground/2" />
            <div className="absolute inset-x-[18%] -bottom-[1%] h-[6%] rounded-[50%] bg-secondary blur-md dark:bg-background/80" />
            <Image src="/home/heritage-jar.webp" alt="" fill sizes="256px" className="object-contain drop-shadow-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
