import { buttonVariants } from '@pk/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';
import { StateMessage } from '@/components/common/StateMessage';

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-6xl content-center px-4 md:px-8">
      <StateMessage
        icon={<Compass />}
        title="Page not found"
        description="The page you are looking for has moved or never existed. Even mountain trails get re-routed."
        action={
          <>
            <Link href="/" className={buttonVariants()}>
              Go to the home page
            </Link>
            <Link href="/products" className={buttonVariants({ variant: 'outline' })}>
              Shop pickles
            </Link>
          </>
        }
      />
    </div>
  );
}
