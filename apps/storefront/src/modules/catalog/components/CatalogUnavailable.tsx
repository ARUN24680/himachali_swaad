'use client';

import { Button } from '@pk/ui';
import { CloudOff, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { StateMessage } from '@/components/common/StateMessage';

/** Error state when the catalogue can't be fetched — retry re-runs the Server Component. */
export function CatalogUnavailable() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <StateMessage
        tone="error"
        icon={<CloudOff />}
        title="We couldn't open the pantry"
        description="Our shop couldn't load the pickles just now. Please check your connection and try again."
        action={
          <Button variant="outline" disabled={pending} onClick={() => start(() => router.refresh())}>
            <RefreshCcw aria-hidden="true" className={pending ? 'animate-spin' : undefined} />
            Try again
          </Button>
        }
      />
    </div>
  );
}
