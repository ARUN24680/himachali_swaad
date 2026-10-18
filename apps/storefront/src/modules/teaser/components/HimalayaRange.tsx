import { cn } from '@pk/ui';
import {
  DIV_FAR,
  DIV_FAR_RIDGE,
  DIV_NEAR,
  DIV_SHADE,
  DIV_SNOW,
  DIV_STREAKS,
  FAR,
  FOREST,
  MAIN,
  MAIN_SHADE,
  NEAR,
  SNOW,
} from './range-paths';

/**
 * One calm Himalayan composition (paths from `apps/storefront/scripts/gen-range.py`):
 * - a far ridge that fades into mist (atmospheric perspective),
 * - one massif with a hero peak and two lower peaks, softly shaded with vertical fades,
 * - a modest, soft-edged snow cap on the two tallest peaks only,
 * - a near foothill with an irregular deodar treeline, in the band colour, so the illustration
 *   melts into the next section with no strip or gap.
 * The sun rises in the saddle right of the hero peak. Every layer is opaque underneath, so the sun
 * sits truly behind the ridges. Gradient stops take token colours via `currentColor`.
 *
 * `variant="divider"` is the quiet version for a slim section break, see `RidgeDivider`.
 */
export function HimalayaRange({
  id,
  variant = 'hero',
  className,
}: {
  id: string;
  variant?: 'hero' | 'divider';
  className?: string;
}) {
  const g = (name: string) => `${id}-${name}`;
  const hero = variant === 'hero';
  if (!hero) return <RidgeDivider id={id} className={className} />;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={hero ? '0 56 1440 424' : '0 200 1440 220'}
      preserveAspectRatio="xMidYMax slice"
      className={cn('pointer-events-none block w-full', className)}
    >
      <defs>
        <linearGradient id={g('far')} x1="0" y1="206" x2="0" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.13" />
          <stop offset="1" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('main')} x1="0" y1="72" x2="0" y2="420" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.24" />
          <stop offset="1" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={g('shade')} x1="0" y1="72" x2="0" y2="330" gradientUnits="userSpaceOnUse">
          <stop
            offset="0"
            className="text-secondary dark:text-background"
            stopColor="currentColor"
            stopOpacity="0.35"
          />
          <stop offset="1" className="text-secondary dark:text-background" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('snow')} x1="0" y1="72" x2="0" y2="168" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.82" />
          <stop offset="0.6" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="1" className="text-secondary-foreground" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id={g('mist')} x1="0" y1="250" x2="0" y2="430" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary" stopColor="currentColor" stopOpacity="0" />
          <stop offset="1" className="text-secondary" stopColor="currentColor" stopOpacity="0.75" />
        </linearGradient>
      </defs>

      {hero && (
        <>
          <circle cx="862" cy="230" r="46" className="fill-primary/90" />
        </>
      )}

      {/* Far ridge: opaque base, faint tint that fades into mist */}
      <path d={FAR} className="fill-secondary" />
      <path d={FAR} fill={`url(#${g('far')})`} />

      {hero && (
        <>
          {/* The massif: hero peak + two lower peaks, soft vertical shading, modest snow */}
          <path d={MAIN} className="fill-secondary" />
          <path d={MAIN} fill={`url(#${g('main')})`} />
          <path d={SNOW} fill={`url(#${g('snow')})`} />
          <path d={MAIN_SHADE} fill={`url(#${g('shade')})`} />
          <rect x="0" y="250" width="1440" height="230" fill={`url(#${g('mist')})`} />
        </>
      )}

      {/* Near foothill + deodar treeline, in the band colour so it melts into the next section */}
      <path d={NEAR} className="fill-secondary" />
      <path d={FOREST} className="fill-secondary dark:fill-background/45" />
    </svg>
  );
}

/**
 * The valleys divider (v8): a medium-height, calm Dhauladhar silhouette that echoes the hero photo.
 * - Far snow range (smooth Béziers): a faint moonlit wash that fades into mist downward, five main
 *   summits right of centre with real snow: caps with an irregular snowline (higher on ribs, dipping
 *   into gullies), a few streaks down the faces, and a shaded east face so each summit has a lit
 *   and a shaded side. The snow fades into rock below; a soft rim light traces the ridge.
 * - Near foothills: long, low and rolling, in the band colour (darker = nearer), then a valley mist
 *   in the band green over the lower third, so the band melts into the next section with no edge.
 * Snow is a touch softer in light mode, where the band is darker and contrast is higher.
 */
function RidgeDivider({ id, className }: { id: string; className?: string }) {
  const g = (name: string) => `${id}-${name}`;
  const fg = 'text-secondary-foreground';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 44 1440 256"
      preserveAspectRatio="xMidYMax slice"
      className={cn('pointer-events-none block w-full', className)}
    >
      <defs>
        <linearGradient id={g('far')} x1="0" y1="90" x2="0" y2="290" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={fg} stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="0.5" className={fg} stopColor="currentColor" stopOpacity="0.08" />
          <stop offset="1" className={fg} stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('snow')} x1="0" y1="72" x2="0" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={fg} stopColor="currentColor" stopOpacity="0.88" />
          <stop offset="0.5" className={fg} stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="1" className={fg} stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={g('streak')} x1="0" y1="130" x2="0" y2="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={fg} stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" className={fg} stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('shade')} x1="0" y1="70" x2="0" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary dark:text-background" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="1" className="text-secondary dark:text-background" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={fg} stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.5" className={fg} stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" className={fg} stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g('clip')}>
          <path d={DIV_FAR} />
        </clipPath>
        {/* Geometry-only filters (no colour): soften the snowline and the shaded faces */}
        <filter
          id={g('soft')}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1440"
          height="300"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter
          id={g('blur')}
          filterUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="1440"
          height="300"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <linearGradient id={g('mist')} x1="0" y1="150" x2="0" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" className="text-secondary" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.55" className="text-secondary" stopColor="currentColor" stopOpacity="0.7" />
          <stop offset="1" className="text-secondary" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
        <linearGradient id={g('near')} x1="0" y1="250" x2="0" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0" className={fg} stopColor="currentColor" stopOpacity="0.05" />
          <stop offset="1" className={fg} stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Far snow range: wash, snow (caps + streaks, a touch softer in light mode), shaded east faces */}
      <path d={DIV_FAR} fill={`url(#${g('far')})`} />
      <g clipPath={`url(#${g('clip')})`}>
        <g filter={`url(#${g('soft')})`} className="opacity-80 dark:opacity-100">
          <path d={DIV_SNOW} fill={`url(#${g('snow')})`} />
          <path d={DIV_STREAKS} fill={`url(#${g('streak')})`} />
        </g>
        <path d={DIV_SHADE} fill={`url(#${g('shade')})`} filter={`url(#${g('blur')})`} />
      </g>
      <path
        d={DIV_FAR_RIDGE}
        vectorEffect="non-scaling-stroke"
        strokeWidth="1"
        fill="none"
        stroke={`url(#${g('rim')})`}
      />

      {/* Near foothills: the band colour occludes the far wash, with a faint tint */}
      <path d={DIV_NEAR} className="fill-secondary" />
      <path d={DIV_NEAR} fill={`url(#${g('near')})`} />

      {/* Valley mist: the lower slopes dissolve into the band green, so the divider has no bottom edge */}
      <rect x="0" y="150" width="1440" height="150" fill={`url(#${g('mist')})`} />
    </svg>
  );
}
