import { cn } from '@pk/ui';
import { CalendarDays, Clock } from 'lucide-react';
import type { BlogPost } from '../content/types';
import { formatPostDate, readingMinutes } from '../lib/reading';

/** "4 November 2026 · 4 min read" — date is a real `<time>`, reading time is computed. */
export function PostMeta({ post, className }: { post: BlogPost; className?: string }) {
  const minutes = readingMinutes(post);
  return (
    <p className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays aria-hidden="true" className="size-4" />
        <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
      </span>
      <span className="inline-flex items-center gap-1.5" data-testid="reading-time">
        <Clock aria-hidden="true" className="size-4" />
        {minutes} min read
      </span>
    </p>
  );
}
