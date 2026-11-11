import { PageSkeleton } from '@/components/common/PageSkeleton';

/** My-orders loading shell (audit §3.5); also covers an order's detail page. */
export default function Loading() {
  return <PageSkeleton variant="list" label="Loading your orders" />;
}
