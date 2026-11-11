import { PageSkeleton } from '@/components/common/PageSkeleton';

/** Journal loading shell (audit §3.5); also covers each article. */
export default function Loading() {
  return <PageSkeleton variant="article" label="Loading the journal" />;
}
