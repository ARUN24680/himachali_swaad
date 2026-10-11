'use client';

import { reportError } from '@/lib/report-error';
import { Button, buttonVariants } from '@pk/ui';
import { CloudOff, RefreshCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { StateMessage } from '@/components/common/StateMessage';

export default function ProductError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <StateMessage
        tone="error"
        icon={<CloudOff />}
        title="We couldn't load this pickle"
        description="Something went wrong while fetching the product. Please try again."
        action={
          <>
            <Button onClick={reset}>
              <RefreshCcw aria-hidden="true" />
              Try again
            </Button>
            <Link href="/products" className={buttonVariants({ variant: 'outline' })}>
              All pickles
            </Link>
          </>
        }
      />
    </div>
  );
}
