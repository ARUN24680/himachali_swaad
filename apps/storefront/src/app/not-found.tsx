import { buttonVariants } from '@pk/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';
import { StateMessage } from '@/components/common/StateMessage';

/**
 * Last-resort 404 outside every route group. Next serialises this boundary into the payload of
 * every page — the `/coming-soon` teaser too — so it carries no brand, product or store links.
 * Store 404s render `(site)/not-found.tsx` (with header + footer) via `(site)/[...missing]`.
 */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid min-h-dvh w-full max-w-6xl content-center px-4 md:px-8">
      <StateMessage
        icon={<Compass />}
        title="Page not found"
        description="The page you are looking for has moved or never existed. Even mountain trails get re-routed."
        action={
          <Link href="/" className={buttonVariants()}>
            Go to the home page
          </Link>
        }
      />
    </main>
  );
}
