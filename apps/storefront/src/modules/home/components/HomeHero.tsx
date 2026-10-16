'use client';

import type { ProductListResponse } from '@pk/shared';
import { Badge, buttonVariants, cn } from '@pk/ui';
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { MountainRidges } from '@/components/common/MountainRidges';
import { formatDate } from '@/modules/catalog';

const ANGLES = [
  { id: 'studio', label: 'Studio Front', src: '/home/hero-jar-studio.webp' },
  { id: 'elevated', label: '35° Tabletop', src: '/home/jar-elevated-spices.webp' },
  { id: 'culinary', label: 'Homestay Table', src: '/home/jar-lifestyle-culinary.webp' },
];

export function HomeHero({
  freshestBatch,
  heroImage = '/home/hero-jar-studio.webp',
  heroAlt = 'Pahadi Khatki Artisanal Himachali Pickle Jar',
}: {
  freshestBatch?: ProductListResponse['freshestBatch'] | null;
  heroImage?: string | null;
  heroAlt?: string;
}) {
  const [activeImage, setActiveImage] = useState(heroImage || '/home/hero-jar-studio.webp');

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-secondary text-secondary-foreground"
    >
      {/* Ambient warm gradient highlights */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 right-0 -z-10 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-10 left-10 -z-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-28 md:grid-cols-2 md:gap-14 md:px-8 md:pt-16 md:pb-36 lg:pt-20">
        {/* Left Column: Editorial Headline, Story, Trust & Actions */}
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold tracking-wider text-accent-foreground uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Authentic Himalayan Kitchen
            </span>
            <div className="flex items-center gap-1 text-xs font-medium text-secondary-foreground/90">
              <div className="flex text-primary">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                ))}
              </div>
              <span className="ml-1 font-semibold text-secondary-foreground">4.9</span>
              <span className="text-secondary-foreground/75">(1,200+ Jar Orders)</span>
            </div>
          </div>

          <h1
            id="hero-title"
            className="font-serif text-4xl leading-[1.08] font-medium tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Taste the mountains, slow-cooked in small batches.
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-secondary-foreground/85 md:text-lg">
            Succulent chicken, tender mutton and cold-water trout slow-simmered in pure cold-pressed mustard oil with
            hand-pounded Pahadi spices. Sealed in glass jars with zero artificial preservatives.
          </p>

          {/* Key Trust Pillars */}
          <div className="grid grid-cols-2 gap-3 pt-1 text-xs text-secondary-foreground/95 sm:flex sm:flex-wrap sm:gap-4 sm:text-sm">
            <div className="flex items-center gap-2 rounded-md border border-secondary-foreground/10 bg-secondary-foreground/5 px-3 py-1.5">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium">Cold-Pressed Mustard Oil</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-secondary-foreground/10 bg-secondary-foreground/5 px-3 py-1.5">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium">No Preservatives</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-secondary-foreground/10 bg-secondary-foreground/5 px-3 py-1.5">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium">100% Real Meat Chunks</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-secondary-foreground/10 bg-secondary-foreground/5 px-3 py-1.5">
              <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium">FSSAI Certified</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/products"
              className={cn(
                buttonVariants({ size: 'lg' }),
                'group shadow-md shadow-primary/20 transition-all hover:shadow-primary/30 active:scale-[0.98]',
              )}
            >
              Taste the Mountains
              <ArrowRight
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </Link>
            <Link
              href="/about"
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-secondary-foreground/30 text-secondary-foreground hover:border-secondary-foreground/50 hover:bg-secondary-foreground/10',
              )}
            >
              Our Heritage Story
            </Link>
          </div>

          {/* Live Batch Code Badge */}
          {freshestBatch && (
            <div
              className="flex flex-wrap items-center gap-2.5 rounded-lg border border-secondary-foreground/15 bg-secondary-foreground/5 p-3 text-xs text-secondary-foreground/85"
              data-testid="current-batch"
            >
              <span className="text-[11px] font-semibold tracking-wider text-secondary-foreground uppercase">
                Fresh Batch:
              </span>
              <Badge tone="primary" className="font-mono font-bold tracking-[0.06em] tabular-nums">
                {freshestBatch.batchCode}
              </Badge>
              <span className="truncate">
                {freshestBatch.productTitle} · Bottled on {formatDate(freshestBatch.manufacturedAt)}
              </span>
            </div>
          )}
        </div>

        {/* Right Column: Realistic Studio Jar Presentation with Angle Switcher */}
        <div className="relative mx-auto w-full max-w-sm sm:max-w-md md:max-w-none">
          {/* Subtle warm backlight behind the jar */}
          <div
            className="absolute inset-0 -z-10 scale-95 transform-gpu rounded-3xl bg-primary/20 blur-3xl"
            aria-hidden="true"
          />

          {/* Main Visual Card */}
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-secondary-foreground/25 bg-card shadow-float transition-all duration-300">
            <Image
              src={activeImage}
              alt={heroAlt}
              fill
              sizes="(min-width: 1024px) 520px, (min-width: 768px) 45vw, 90vw"
              priority
              className="object-cover transition-all duration-500 ease-out"
            />

            {/* Floating Top Badge */}
            <div className="absolute top-3.5 left-3.5 flex items-center gap-1.5 rounded-full border border-border/80 bg-card/95 px-3 py-1 text-[11px] font-semibold text-card-foreground shadow-md backdrop-blur-md">
              <span className="size-2 animate-pulse rounded-full bg-success" aria-hidden="true" />
              100% Artisanal Himachali Recipe
            </div>

            {/* Bottom Gradient Label */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-secondary/95 via-secondary/60 to-transparent p-4 pt-12 text-secondary-foreground">
              <p className="font-serif text-lg font-medium tracking-wide drop-shadow-sm sm:text-xl">
                Pahadi Khatki Non-Veg Pickle
              </p>
              <p className="text-xs text-secondary-foreground/85 drop-shadow-sm">
                Steeped in pure cold-pressed mustard oil with roasted mountain spices
              </p>
            </div>
          </div>

          {/* Interactive Photography Angle Switcher */}
          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-secondary-foreground/15 bg-secondary-foreground/5 p-2 backdrop-blur-sm">
            <span className="px-1.5 text-[11px] font-semibold tracking-wider text-secondary-foreground/75 uppercase">
              Select Angle:
            </span>
            <div className="flex items-center gap-2">
              {ANGLES.map((angle) => {
                const isSelected = activeImage === angle.src;
                return (
                  <button
                    key={angle.id}
                    type="button"
                    onClick={() => setActiveImage(angle.src)}
                    className={cn(
                      'group relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-secondary-foreground/10 text-secondary-foreground/80 hover:bg-secondary-foreground/20 hover:text-secondary-foreground',
                    )}
                  >
                    <span>{angle.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mountain Ridges Base */}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-24 opacity-80 md:h-36 lg:h-44" aria-hidden="true">
        <MountainRidges />
      </div>
    </section>
  );
}
