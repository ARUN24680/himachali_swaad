/**
 * Decorative layers for the About hero band (aria-hidden, token colours only, no motion). Same visual
 * language as the home hero — warm light, film grain, a faint ridge and ONE smooth curve with a gold
 * hairline into the page — but owned by the content module so neither page can drift the other.
 * The shared `MountainRidges` illustration is no longer used here and is left untouched.
 */
export function AboutBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Warm key light from the photo side + a cool lift top-left */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_80%_45%] from-primary/15 via-primary/5 via-35% to-transparent to-65%" />
      <div className="absolute inset-0 bg-radial-[ellipse_at_0%_0%] from-secondary-foreground/8 to-transparent to-55%" />

      {/* Film grain, coloured by the text token via currentColor */}
      <svg className="absolute inset-0 size-full text-secondary-foreground opacity-[0.07] mix-blend-soft-light">
        <filter id="pk-about-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.2" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
        <rect width="100%" height="100%" fill="currentColor" filter="url(#pk-about-grain)" />
      </svg>

      {/* Faint Dhauladhar silhouette fading upward — depth, not a second band */}
      <svg
        viewBox="0 0 1440 220"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-40 w-full mask-t-from-30% md:h-64"
      >
        <path
          d="M0 140 C 120 120 200 70 300 82 S 460 150 560 124 S 720 44 820 60 S 980 136 1080 112 S 1240 52 1320 70 S 1410 104 1440 98 V220 H0 Z"
          className="fill-secondary-foreground/4 dark:fill-secondary-foreground/3"
        />
      </svg>

      {/* The single hand-over edge into the page canvas + gold hairline */}
      <svg
        viewBox="0 0 1440 64"
        preserveAspectRatio="none"
        className="absolute inset-x-0 -bottom-px h-8 w-full sm:h-12 lg:h-16"
      >
        <path d="M0 26 C 180 52 420 14 700 14 C 980 14 1180 60 1440 36 V64 H0 Z" className="fill-background" />
        <path
          d="M0 26 C 180 52 420 14 700 14 C 980 14 1180 60 1440 36"
          vectorEffect="non-scaling-stroke"
          className="fill-none stroke-primary/35"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
