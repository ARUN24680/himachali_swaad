import type { BlogBlock, BlogPost } from '../content/types';

const blockText = (b: BlogBlock): string =>
  b.type === 'list' ? b.items.join(' ') : b.type === 'note' ? `${b.title} ${b.text}` : b.text;

/** Plain-text word count of the article body (title excluded) — feeds `wordCount` in Article JSON-LD. */
export function wordCount(post: BlogPost): number {
  return post.blocks.map(blockText).join(' ').split(/\s+/).filter(Boolean).length;
}

/** Reading time at ~200 words a minute, never below 1. */
export const readingMinutes = (post: BlogPost): number => Math.max(1, Math.round(wordCount(post) / 200));

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

/** "2026-11-04" → "4 November 2026" (IST calendar day). */
export const formatPostDate = (iso: string): string => dateFmt.format(new Date(`${iso}T00:00:00+05:30`));
