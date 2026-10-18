import { MapPinOff } from 'lucide-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/app/providers/ThemeProvider';

/**
 * What a pre-launch locked build renders for every URL (see `lib/launch-mode.ts`): a neutral 404,
 * no brand, no sign-in, no links into the app. Light/dark follows the system like the real app.
 */
export function mountLocked(root: HTMLElement): void {
  document.title = 'Page not found';
  createRoot(root).render(
    <StrictMode>
      <ThemeProvider>
        <main className="grid min-h-dvh place-items-center bg-background px-4 py-12 text-center text-foreground">
          <div className="grid justify-items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-14 place-items-center rounded-full bg-muted text-accent-foreground [&_svg]:size-6"
            >
              <MapPinOff />
            </span>
            <h1 className="font-serif text-2xl font-medium">Page not found</h1>
            <p className="max-w-sm text-sm text-muted-foreground">This page is not available.</p>
          </div>
        </main>
      </ThemeProvider>
    </StrictMode>,
  );
}
