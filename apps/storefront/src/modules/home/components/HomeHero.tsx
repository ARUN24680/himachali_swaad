'use client';

import type { ProductListResponse } from '@pk/shared';
import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, Check, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate } from '@/modules/catalog';
import { HeroBackdrop } from './HeroBackdrop';

/** Facts the store actually delivers on (no ratings, counts or certifications we can't back). */
const TRUST = ['Cold-pressed mustard oil', 'No added preservatives', 'Batch-coded jars', 'Prepaid, tracked delivery'];

interface HeroImageSlide {
  id: string;
  src: string;
  alt: string;
  badgeTitle: string;
  badgeDetail: string;
}

const AUTO_RUN_INTERVAL_MS = 4500;
const USER_RESUME_DELAY_MS = 3500;
const TRANSITION_DURATION_MS = 650;

export function HomeHero({
  freshestBatch,
  heroImage = '/home/hero-jar-studio.webp',
  heroAlt = 'A glass jar of Pahadi Khatki pickle on a slate stone coaster',
}: {
  freshestBatch?: ProductListResponse['freshestBatch'] | null;
  heroImage?: string;
  heroAlt?: string;
}) {
  const slides: HeroImageSlide[] = [
    {
      id: 'studio-heritage-jar',
      src: heroImage || '/home/hero-jar-studio.webp',
      alt: heroAlt || 'Pahadi Khatki Garlic Chicken Pickle sealed in a glass jar on slate stone',
      badgeTitle: freshestBatch?.productTitle?.replace(/\s*\(Demo\)/i, '') || 'Garlic Chicken Pickle',
      badgeDetail: freshestBatch ? `bottled ${formatDate(freshestBatch.manufacturedAt)}` : 'bottled in Kangra Valley',
    },
    {
      id: 'lifestyle-culinary',
      src: '/home/jar-lifestyle-culinary.webp',
      alt: 'Authentic Himachali pickle served with a traditional mountain meal',
      badgeTitle: 'Slow-Cooked Mountain Heritage',
      badgeDetail: 'Authentic Kangra woodfire recipe',
    },
    {
      id: 'elevated-spices',
      src: '/home/jar-elevated-spices.webp',
      alt: 'Pahadi Khatki pickle jar with whole roasted spices and cold-pressed mustard oil',
      badgeTitle: 'Hand-Pounded Pahadi Spices',
      badgeDetail: 'Steeped in pure cold-pressed mustard oil',
    },
    {
      id: 'pickle-texture',
      src: '/home/pickle-texture.webp',
      alt: 'Close-up of slow-cooked meat pickle chunks glistening in aromatic mustard oil',
      badgeTitle: 'Tender Slow-Cooked Meat',
      badgeDetail: 'Zero preservatives · 100% artisanal craft',
    },
  ];

  // Guaranteed bounds: currentSlide is ALWAYS an integer from 0 to slides.length - 1
  const [currentSlide, setCurrentSlide] = useState(0);
  const [transitionState, setTransitionState] = useState<{
    targetSlide: number;
    direction: 'forward' | 'backward';
    isAnimating: boolean;
  } | null>(null);

  const lastUserInteractionRef = useRef<number>(0);
  const touchStartX = useRef<number | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSlideData = slides[currentSlide] ?? slides[0]!;
  const displaySlide =
    transitionState && transitionState.isAnimating
      ? (slides[transitionState.targetSlide] ?? currentSlideData)
      : currentSlideData;

  // Finalize transition cleanly and update state
  const finalizeTransition = useCallback((targetIndex: number) => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    setCurrentSlide(targetIndex);
    setTransitionState(null);
  }, []);

  // Trigger a smooth transition in single flow
  const startTransition = useCallback(
    (targetIndex: number, direction: 'forward' | 'backward') => {
      // If already transitioning to this exact slide, don't restart
      if (transitionState?.targetSlide === targetIndex) return;

      // Clean any existing safety timer
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }

      setTransitionState({
        targetSlide: targetIndex,
        direction,
        isAnimating: false,
      });

      // Next tick: trigger CSS translation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitionState({
            targetSlide: targetIndex,
            direction,
            isAnimating: true,
          });

          // Bulletproof safety timeout in case onTransitionEnd doesn't fire (e.g. background tab)
          safetyTimeoutRef.current = setTimeout(() => {
            finalizeTransition(targetIndex);
          }, TRANSITION_DURATION_MS + 60);
        });
      });
    },
    [finalizeTransition, transitionState?.targetSlide],
  );

  const recordUserInteraction = useCallback(() => {
    lastUserInteractionRef.current = Date.now();
  }, []);

  // Controls: Right arrow moves right-to-left (forward)
  const nextSlide = useCallback(() => {
    recordUserInteraction();
    if (transitionState) return; // Prevent double trigger during animation
    const nextIdx = (currentSlide + 1) % slides.length;
    startTransition(nextIdx, 'forward');
  }, [currentSlide, recordUserInteraction, slides.length, startTransition, transitionState]);

  // Controls: Left arrow moves left-to-right (backward)
  const prevSlide = useCallback(() => {
    recordUserInteraction();
    if (transitionState) return;
    const prevIdx = (currentSlide - 1 + slides.length) % slides.length;
    startTransition(prevIdx, 'backward');
  }, [currentSlide, recordUserInteraction, slides.length, startTransition, transitionState]);

  const goToSlide = useCallback(
    (targetIdx: number) => {
      if (targetIdx === currentSlide || transitionState) return;
      recordUserInteraction();
      const direction = targetIdx > currentSlide ? 'forward' : 'backward';
      startTransition(targetIdx, direction);
    },
    [currentSlide, recordUserInteraction, startTransition, transitionState],
  );

  // Automatic runner: Runs automatically in a single flow when user is idle
  useEffect(() => {
    const timer = setInterval(() => {
      const timeSinceLastControl = Date.now() - lastUserInteractionRef.current;
      if (timeSinceLastControl >= USER_RESUME_DELAY_MS) {
        const nextIdx = (currentSlide + 1) % slides.length;
        startTransition(nextIdx, 'forward');
      }
    }, AUTO_RUN_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [currentSlide, slides.length, startTransition]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextSlide();
    }
  };

  // Touch swipe support (left to right / right to left)
  const handleTouchStart = (e: React.TouchEvent) => {
    recordUserInteraction();
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 35) {
      recordUserInteraction();
      if (diff > 0) nextSlide();
      else prevSlide();
    }
    touchStartX.current = null;
  };

  // Prepare active dual-slide track for seamless sliding:
  // When idle: shows just currentSlide (100% of container)
  // When forward: shows [currentSlide, targetSlide] translating 0% -> -50%
  // When backward: shows [targetSlide, currentSlide] translating -50% -> 0%
  const isForward = transitionState?.direction === 'forward';
  const targetSlideData = transitionState !== null ? slides[transitionState.targetSlide] : null;

  return (
    <section
      aria-labelledby="hero-title"
      /* Pulled up under the floating header (76px / 80px) so the pill sits on the sage band, no ivory strip */
      className="relative isolate -mt-19 overflow-hidden bg-secondary pt-19 text-secondary-foreground md:-mt-20 md:pt-20"
    >
      <HeroBackdrop />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 sm:pb-20 md:grid-cols-12 md:gap-8 md:px-8 md:pt-14 md:pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:pt-16 lg:pb-28">
        {/* Left Column: Authentic Brand Headline, Story & CTAs (Clean & Stable) */}
        <div className="grid gap-5 md:col-span-7 md:gap-6 lg:col-span-1">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-secondary-foreground/10 bg-card/45 px-3.5 py-1.5 text-[0.6875rem] font-semibold tracking-[0.2em] text-primary uppercase shadow-sm backdrop-blur-sm dark:bg-secondary-foreground/5">
            <MapPin className="size-3.5" aria-hidden="true" />
            Small-batch · Himachal Pradesh
          </p>

          <h1
            id="hero-title"
            className="font-serif text-4xl leading-[1.05] font-medium tracking-tight text-balance text-secondary-foreground sm:text-5xl md:text-[2.75rem] lg:text-6xl"
          >
            Taste the mountains,{' '}
            <span className="mt-1 block font-normal text-primary italic">slow-cooked in small batches.</span>
          </h1>

          <p className="max-w-md text-base leading-relaxed text-pretty text-secondary-foreground/85 md:text-lg lg:max-w-lg">
            Chicken, mutton and trout pickles simmered in cold-pressed mustard oil with hand-pounded Pahadi spices —
            sealed in glass.
          </p>

          <div id="hero-ctas" className="grid grid-cols-2 gap-3 pt-1 sm:flex sm:flex-wrap">
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
                <span className="mt-px grid size-4 shrink-0 place-items-center rounded-full bg-card/70 ring-1 ring-primary/20 sm:mt-0.5 dark:bg-primary/15">
                  <Check className="size-3 text-primary" strokeWidth={3} aria-hidden="true" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Right Column: Rock-Solid Single-Flow Runner with Left/Right Controls */}
        <div
          aria-roledescription="carousel"
          aria-label="Pickle showcase gallery"
          onKeyDown={handleKeyDown}
          onMouseEnter={recordUserInteraction}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="group/carousel relative mx-auto w-full max-w-72 sm:max-w-xs md:col-span-5 md:max-w-none lg:col-span-1"
        >
          {/* Warm ambient aura behind the rectangle card */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-radial from-card/60 via-card/15 to-transparent blur-2xl dark:from-primary/20 dark:via-primary/5"
          />

          {/* Unified Aesthetic Rectangle Card */}
          <div className="relative aspect-square w-full overflow-hidden rounded-3xl border-4 border-card/60 bg-secondary-foreground/5 shadow-2xl shadow-primary/25 backdrop-blur-sm dark:border dark:border-primary/30">
            {/* Sliding Track */}
            {transitionState !== null && targetSlideData ? (
              /* Active dual-slide translation window (guaranteed 100% visible, zero blank gap) */
              <div
                onTransitionEnd={() => finalizeTransition(transitionState.targetSlide)}
                className={cn(
                  'flex size-full',
                  transitionState.isAnimating
                    ? 'transition-transform duration-[650ms] ease-in-out motion-reduce:transition-none'
                    : 'transition-none',
                )}
                style={{
                  width: '200%',
                  transform: isForward
                    ? transitionState.isAnimating
                      ? 'translateX(-50%)'
                      : 'translateX(0%)'
                    : transitionState.isAnimating
                      ? 'translateX(0%)'
                      : 'translateX(-50%)',
                }}
              >
                {/* First slot */}
                <div className="relative h-full w-1/2 shrink-0">
                  <Image
                    src={isForward ? currentSlideData.src : targetSlideData.src}
                    alt={isForward ? currentSlideData.alt : targetSlideData.alt}
                    fill
                    sizes="(min-width: 1024px) 420px, (min-width: 768px) 320px, 288px"
                    className="object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-linear-to-t from-secondary-foreground/35 via-transparent to-transparent"
                  />
                </div>
                {/* Second slot */}
                <div className="relative h-full w-1/2 shrink-0">
                  <Image
                    src={isForward ? targetSlideData.src : currentSlideData.src}
                    alt={isForward ? targetSlideData.alt : currentSlideData.alt}
                    fill
                    sizes="(min-width: 1024px) 420px, (min-width: 768px) 320px, 288px"
                    className="object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-linear-to-t from-secondary-foreground/35 via-transparent to-transparent"
                  />
                </div>
              </div>
            ) : (
              /* Idle state: Current slide sits rock-solid in place */
              <div className="relative size-full">
                <Image
                  src={currentSlideData.src}
                  alt={currentSlideData.alt}
                  fill
                  sizes="(min-width: 1024px) 420px, (min-width: 768px) 320px, 288px"
                  priority
                  className="object-cover"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-linear-to-t from-secondary-foreground/35 via-transparent to-transparent"
                />
              </div>
            )}

            {/* Left to Right / Right to Left Controls */}
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous image (move left to right)"
              className="absolute top-1/2 left-2.5 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-secondary-foreground/20 bg-secondary/80 text-secondary-foreground/90 backdrop-blur-md transition-all hover:scale-110 hover:border-primary hover:bg-primary/25 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden sm:size-9"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next image (move right to left)"
              className="absolute top-1/2 right-2.5 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-secondary-foreground/20 bg-secondary/80 text-secondary-foreground/90 backdrop-blur-md transition-all hover:scale-110 hover:border-primary hover:bg-primary/25 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-hidden sm:size-9"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>

            {/* Sleek Bottom Indicator Dots */}
            <div
              className="absolute inset-x-0 bottom-3.5 z-20 flex items-center justify-center gap-1.5"
              role="tablist"
              aria-label="Image gallery slides"
            >
              {slides.map((s, idx) => {
                const isActive = idx === (transitionState !== null ? transitionState.targetSlide : currentSlide);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`View ${s.badgeTitle}`}
                    onClick={() => goToSlide(idx)}
                    className="p-1 focus-visible:outline-hidden"
                  >
                    <span
                      className={cn(
                        'block h-1.5 rounded-full transition-all duration-300',
                        isActive ? 'w-6 bg-card shadow-sm' : 'w-1.5 bg-card/55 hover:bg-card/80',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Showcase Badge Below the Card */}
          <p
            className="relative z-10 mx-auto mt-3.5 grid w-fit max-w-[95%] justify-items-center gap-0.5 rounded-full border border-secondary-foreground/10 bg-card/75 px-5 py-2 text-center text-xs text-muted-foreground shadow-float backdrop-blur-md transition-all duration-300 dark:bg-secondary/85 dark:text-secondary-foreground/80"
            data-testid="current-batch"
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full bg-success ring-2 ring-success/25" aria-hidden="true" />
              <span className="font-semibold text-foreground dark:text-secondary-foreground">
                {displaySlide.badgeTitle}
              </span>
            </span>
            <span className="text-balance">{displaySlide.badgeDetail}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
