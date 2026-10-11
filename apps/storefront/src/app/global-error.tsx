'use client';

import { reportError } from '@/lib/report-error';
import { useEffect } from 'react';
import '@/styles/globals.css';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body className="grid min-h-dvh place-content-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">Please refresh the page.</p>
      </body>
    </html>
  );
}
