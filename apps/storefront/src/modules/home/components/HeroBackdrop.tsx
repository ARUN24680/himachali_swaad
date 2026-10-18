/**
 * Decorative layers for the home hero band (all aria-hidden, token colours only, no motion):
 * a warm light wash, a film grain, a faint Dhauladhar silhouette and ONE smooth edge that hands
 * over to the page canvas. Kept separate from the shared `MountainRidges` (About page) on purpose.
 */
export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Light: a warm key light from the jar side + a cool lift top-left, so the band has volume */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_78%_42%] from-primary/15 via-primary/5 via-35% to-transparent to-65%" />
      <div className="absolute inset-0 bg-radial-[ellipse_at_0%_0%] from-secondary-foreground/8 to-transparent to-55%" />

      {/* Film grain — breaks up the flat fill; coloured by the text token via currentColor */}
      <svg className="absolute inset-0 size-full text-secondary-foreground opacity-[0.07] mix-blend-soft-light">
        <filter id="pk-hero-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.2" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
        <rect width="100%" height="100%" fill="currentColor" filter="url(#pk-hero-grain)" />
      </svg>

      {/* Faint ridge silhouette, fading upward — depth, not a second band */}
      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-40 w-full mask-t-from-30% md:h-64"
      >
        <path
          d="M0 150 C 90 132 150 96 230 104 S 360 150 450 128 S 600 58 700 74 S 860 140 960 118 S 1120 40 1220 56 S 1380 120 1440 108 V220 H0 Z"
          className="fill-secondary-foreground/4 dark:fill-secondary-foreground/3"
        />
      </svg>

      {/* The single hand-over edge: one smooth curve in the next section's colour + a gold hairline */}
      <svg
        viewBox="0 0 1440 64"
        preserveAspectRatio="none"
        className="absolute inset-x-0 -bottom-px h-8 w-full sm:h-12 lg:h-16"
      >
        <path d="M0 40 C 300 64 560 6 860 12 C 1100 17 1280 50 1440 26 V64 H0 Z" className="fill-background" />
        <path
          d="M0 40 C 300 64 560 6 860 12 C 1100 17 1280 50 1440 26"
          vectorEffect="non-scaling-stroke"
          className="fill-none stroke-primary/35"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
