import { buttonVariants } from '@pk/ui';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { StateMessage } from '@/components/common/StateMessage';

export default function ProductNotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <StateMessage
        icon={<SearchX />}
        title="This jar isn't on the shelf"
        description="The pickle you're looking for may have been renamed or retired. Our current batch is just a click away."
        action={
          <Link href="/products" className={buttonVariants()}>
            Browse all pickles
          </Link>
        }
      />
    </div>
  );
}
