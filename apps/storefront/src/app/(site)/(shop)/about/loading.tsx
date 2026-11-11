import { PageSkeleton } from '@/components/common/PageSkeleton';

/** About loading shell (audit §3.5). */
export default function Loading() {
  return <PageSkeleton variant="article" label="Loading our story" />;
}
