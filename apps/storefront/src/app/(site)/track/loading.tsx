import { PageSkeleton } from '@/components/common/PageSkeleton';

/** Track-order loading shell (audit §3.5). */
export default function Loading() {
  return <PageSkeleton variant="form" label="Loading order tracking" />;
}
