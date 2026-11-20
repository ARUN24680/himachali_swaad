/**
 * Colour literals for the Web App Manifest and <meta name="theme-color"> (Phase 7 §7.2).
 * Neither can read CSS variables, so — like D-51 (c) for the storefront — these mirror the tokens
 * in packages/ui/src/styles/globals.css. `build/pwa-plugin.ts` re-reads globals.css on every
 * dev/build start and FAILS if a value here drifts from its token. Never use these in components.
 */
export const PWA_COLORS = {
  light: {
    /** --secondary (Sage band) — the desk's app bar, so the phone status bar continues it. */
    secondary: '#9eb294', // pk-allow-color
    /** --background (Pale Sage Ivory) — splash screen background. */
    background: '#e5e8ce', // pk-allow-color
  },
  dark: {
    secondary: '#263025', // pk-allow-color
    background: '#131813', // pk-allow-color
  },
} as const;
