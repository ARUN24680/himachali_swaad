import { cn } from '@pk/ui';

/**
 * Layered Dhauladhar ridge illustration (we have no photography yet). Drawn with token fills only, so
 * it re-themes with light/dark. The front ridge uses `fill-background` to melt into the page below.
 * Decorative: aria-hidden. Fixed viewBox + `preserveAspectRatio` → no layout shift.
 */
export function MountainRidges({ className, showSun = true }: { className?: string; showSun?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 420"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none block h-full w-full', className)}
    >
      {showSun && <circle cx="1080" cy="150" r="58" className="fill-primary/80" />}
      {/* Far range with snow caps */}
      <path
        d="M0 250 L120 190 L210 228 L330 130 L420 200 L520 150 L610 214 L720 110 L820 196 L930 140 L1040 210 L1150 120 L1260 190 L1360 150 L1440 196 L1440 420 L0 420 Z"
        className="fill-secondary-foreground/10"
      />
      <path
        d="M330 130 L300 154 L318 150 L336 162 L352 146 L372 152 Z M720 110 L690 138 L708 134 L724 146 L744 130 L762 140 Z M1150 120 L1122 144 L1140 140 L1156 152 L1172 138 L1190 146 Z"
        className="fill-secondary-foreground/55"
      />
      {/* Mid ridge */}
      <path
        d="M0 300 L90 262 L200 290 L300 236 L420 286 L540 246 L660 296 L780 240 L900 290 L1010 252 L1130 300 L1250 256 L1350 286 L1440 262 L1440 420 L0 420 Z"
        className="fill-secondary-foreground/15"
      />
      {/* Pine line */}
      <path
        d="M0 352 L40 326 L60 340 L84 312 L108 340 L150 330 L190 348 L230 318 L262 344 L320 336 L380 352 L430 324 L470 346 L540 340 L600 356 L660 330 L700 350 L780 342 L840 358 L900 334 L950 352 L1020 346 L1090 360 L1150 332 L1200 352 L1270 344 L1330 358 L1390 336 L1440 350 L1440 420 L0 420 Z"
        className="fill-secondary-foreground/20"
      />
      {/* Front ridge melts into the page canvas */}
      <path
        d="M0 392 C 160 370, 300 384, 460 374 S 760 360, 920 378 S 1220 392, 1440 370 L1440 420 L0 420 Z"
        className="fill-background"
      />
    </svg>
  );
}

/** Token-drawn jar used when a product has no photo yet. */
export function JarIllustration({ className, label }: { className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('block h-full w-full', className)}
    >
      <rect width="200" height="200" className="fill-muted" />
      <ellipse cx="100" cy="168" rx="58" ry="8" className="fill-foreground/10" />
      <rect x="66" y="40" width="68" height="20" rx="4" className="fill-secondary" />
      <path
        d="M56 64 Q56 58 62 58 H138 Q144 58 144 64 V150 Q144 166 128 166 H72 Q56 166 56 150 Z"
        className="fill-tertiary"
      />
      <rect x="66" y="92" width="68" height="40" rx="3" className="fill-card" />
      <path d="M76 120 L88 106 L96 114 L106 100 L124 120 Z" className="fill-secondary/70" />
    </svg>
  );
}
