import { PageSkeleton } from '@/components/common/PageSkeleton';

/** Shared loading shell for every policy page (audit §3.5). */
export default function Loading() {
  return <PageSkeleton variant="article" label="Loading policy" />;
}
