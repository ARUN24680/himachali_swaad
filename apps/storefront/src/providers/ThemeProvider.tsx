'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * next-themes injects an inline <script> that sets the theme class before paint. React 19 warns
 * ("Encountered a script tag while rendering React component") whenever that element is rendered on
 * the CLIENT — e.g. when a wrong URL re-renders the root layout for the 404 boundary. On the server we
 * keep the real script (it must run before first paint); on the client we mark it non-executable, which
 * is what React would do anyway, so the warning goes away without changing behaviour.
 */
const scriptProps = typeof window === 'undefined' ? undefined : ({ type: 'application/json' } as const);

/** D-14: system preference + manual toggle, class strategy to match `@custom-variant dark`. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}
