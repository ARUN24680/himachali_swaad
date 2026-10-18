import { cn } from '@pk/ui';
import { Boxes, ClipboardList, PackageCheck, WalletCards } from 'lucide-react';
import { BrandLogo } from '@/components/common/BrandLogo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
// Compressed (960px webp, ~70 KB) from packages/ui/brand/jar-mockup-elevated-spices.jpg — the
// original is ~800 KB and every bundled asset lands in the partner PWA precache.
import jarPhoto from '../assets/login-jar.webp';

const AREAS = [
  { icon: ClipboardList, label: 'Orders' },
  { icon: PackageCheck, label: 'Packing' },
  { icon: Boxes, label: 'Stock' },
  { icon: WalletCards, label: 'Settlements' },
] as const;

/** The real jar photo under a Deep Pine wash. Decorative: the copy on top carries the meaning. */
function PhotoBackdrop({ imageClassName }: { imageClassName?: string }) {
  return (
    <>
      <img
        src={jarPhoto}
        alt=""
        aria-hidden="true"
        decoding="async"
        className={cn('absolute inset-0 size-full object-cover', imageClassName)}
      />
      {/* Light theme: Deep Pine wash. Dark theme: the page canvas itself, so panel and form share one tone. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-secondary from-15% via-secondary/55 via-50% to-secondary/15 dark:from-background dark:via-background/65 dark:to-background/25"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-secondary/80 to-transparent dark:from-background/85"
      />
    </>
  );
}

/** Desktop (lg+): framed photo panel beside the sign-in card. */
export function LoginBrandPanel({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Pahadi Khatki operations portal"
      className={cn(
        'relative isolate flex-col justify-between overflow-hidden rounded-2xl bg-secondary p-10 text-secondary-foreground xl:p-14 dark:bg-background',
        className,
      )}
    >
      <PhotoBackdrop imageClassName="object-[50%_30%] -z-10" />
      <div className="relative flex items-center justify-between gap-4">
        <BrandLogo variant="dark" size="lg" className="h-16" />
        <span className="rounded-full border border-secondary-foreground/25 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-secondary-foreground/90 uppercase">
          Operations portal
        </span>
      </div>

      <div className="relative grid max-w-xl gap-6">
        <span aria-hidden="true" className="h-px w-16 bg-primary" />
        <p className="font-serif text-4xl leading-[1.15] font-medium text-balance xl:text-5xl">
          Every jar, from the kitchen in Kullu to the customer&rsquo;s door.
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="What you can do here">
          {AREAS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="inline-flex items-center gap-2 rounded-full bg-secondary-foreground/10 px-3.5 py-1.5 text-sm font-medium backdrop-blur-sm"
            >
              <Icon aria-hidden="true" className="size-4 text-primary" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/**
 * Phones: the same photo as a compact band; the sign-in sheet overlaps its bottom edge.
 * Tablets (md): the photo fills the page behind a centred card (the page makes this header absolute).
 */
export function LoginBrandHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'relative isolate h-48 overflow-hidden bg-secondary text-secondary-foreground md:absolute md:inset-0 md:h-auto dark:bg-background',
        className,
      )}
    >
      <PhotoBackdrop imageClassName="object-[50%_40%] -z-10" />
      <div className="relative flex items-center justify-between px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-8 md:pt-[calc(1rem+env(safe-area-inset-top))]">
        <BrandLogo variant="dark" size="md" />
        <ThemeToggle className="text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground" />
      </div>
      <div className="relative mx-auto max-w-md px-4 pt-3 md:px-0 md:pt-6 md:text-center">
        <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">Operations portal</p>
        <p className="mt-1 font-serif text-xl leading-snug font-medium text-balance md:text-3xl">
          From the kitchen in Kullu to the customer&rsquo;s door.
        </p>
      </div>
    </header>
  );
}
