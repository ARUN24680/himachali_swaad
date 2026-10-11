'use client';

import { reportError } from '@/lib/report-error';
import { Button } from '@pk/ui';
import { RefreshCcw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { StateMessage } from '@/components/common/StateMessage';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-6xl content-center px-4 md:px-8">
      <StateMessage
        tone="error"
        icon={<TriangleAlert />}
        title="Something went wrong"
        description="Please try again. If it keeps happening, contact our customer care."
        action={
          <Button onClick={reset}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </Button>
        }
      />
    </div>
  );
}
