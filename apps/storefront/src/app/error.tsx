'use client';

import * as Sentry from '@sentry/nextjs';
import { Button } from '@pk/ui';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center justify-items-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">Please try again. If it keeps happening, contact us on WhatsApp.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
