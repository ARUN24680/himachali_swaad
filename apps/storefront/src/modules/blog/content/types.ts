/**
 * Journal content model (audit 2026-11-03 §5.3). Posts are typed static data — no CMS, no MDX runtime,
 * zero client JS. Blocks are plain strings so word count / reading time are computed, never typed in.
 */
export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; id: string; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  /** A highlighted "keep this in mind" note. */
  | { type: 'note'; title: string; text: string };

export interface BlogPost {
  slug: string;
  title: string;
  /** Meta description + card lead (≤ 160 chars ideal). */
  description: string;
  eyebrow: string;
  /** ISO date (YYYY-MM-DD). */
  publishedAt: string;
  updatedAt?: string;
  keywords: string[];
  image: { src: string; alt: string };
  blocks: BlogBlock[];
}
