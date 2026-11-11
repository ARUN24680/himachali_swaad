import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { BlogPost } from '../content/types';
import { PostMeta } from './PostMeta';

/** Journal card: photo → eyebrow → serif title → lead → meta. The title link covers the whole card. */
export function PostCard({ post, priority = false }: { post: BlogPost; priority?: boolean }) {
  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-[box-shadow,border-color] duration-300 has-[a:focus-visible]:border-ring motion-reduce:transition-none [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:shadow-float"
      data-testid="post-card"
    >
      <div className="relative aspect-16/9 overflow-hidden bg-muted">
        <Image
          src={post.image.src}
          alt={post.image.alt}
          fill
          sizes="(min-width: 1024px) 34rem, (min-width: 768px) 50vw, 100vw"
          preload={priority}
          className="object-cover transition-transform duration-500 motion-safe:[@media(hover:hover)]:group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">{post.eyebrow}</p>
        <h2 className="font-serif text-2xl leading-snug font-medium text-balance">
          <Link
            href={`/blog/${post.slug}`}
            className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring"
          >
            {post.title}
          </Link>
        </h2>
        <p className="line-clamp-3 text-sm leading-relaxed text-pretty text-muted-foreground md:text-base">
          {post.description}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <PostMeta post={post} />
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground"
          >
            Read
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
          </span>
        </div>
      </div>
    </article>
  );
}
