/**
 * Colour literals for the Web App Manifest and <meta name="theme-color"> (Phase 7 §7.2).
 * Neither can read CSS variables, so — like D-51 (c) for the storefront — these mirror the tokens
 * in packages/ui/src/styles/globals.css. `build/pwa-plugin.ts` re-reads globals.css on every
 * dev/build start and FAILS if a value here drifts from its token. Never use these in components.
 */
export const PWA_COLORS = {
  light: {
    /** --secondary (Deep Pine) — the desk's app bar, so the phone status bar continues it. */
    secondary: '#121a16', // pk-allow-color
    /** --background (Warm Ivory) — splash screen background. */
    background: '#f8f5ef', // pk-allow-color
  },
  dark: {
    secondary: '#2c3b34', // pk-allow-color
    background: '#0e1411', // pk-allow-color
  },
} as const;
