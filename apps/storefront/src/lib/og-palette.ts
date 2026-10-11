/**
 * Open Graph images are rendered by Satori (next/og), which cannot read CSS variables — so the
 * brand tokens are mirrored here as literals. Keep in sync with packages/ui/src/styles/globals.css.
 * This is the storefront's ONLY colour-literal file besides <meta theme-color> (Rules §1.4 escape hatch).
 */
export const ogPalette = {
  pine: '#121a16', // pk-allow-color  --secondary (light)
  ivory: '#f8f5ef', // pk-allow-color  --background / --secondary-foreground
  gold: '#d4a359', // pk-allow-color  --primary
  charcoal: '#211d1a', // pk-allow-color  --foreground
  terracotta: '#964824', // pk-allow-color  --tertiary
  mist: 'rgba(248, 245, 239, 0.12)', // pk-allow-color  ridge layers
  mistStrong: 'rgba(248, 245, 239, 0.75)', // pk-allow-color  secondary text on pine
  nonveg: '#7b2c1c', // pk-allow-color  --nonveg
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Ridge silhouette path for 1200×630 cards. */
export const OG_RIDGE =
  'M0 470 L120 410 L210 448 L330 350 L420 420 L520 370 L610 434 L720 330 L820 416 L930 360 L1040 430 L1200 360 L1200 630 L0 630 Z';
