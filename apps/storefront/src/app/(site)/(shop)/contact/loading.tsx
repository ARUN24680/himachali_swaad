import { PageSkeleton } from '@/components/common/PageSkeleton';

/** Contact loading shell (audit §3.5). */
export default function Loading() {
  return <PageSkeleton variant="form" label="Loading contact details" />;
}
