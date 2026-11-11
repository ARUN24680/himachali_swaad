import { buttonVariants, cn } from '@pk/ui';
import { ArrowRight, Lightbulb, ListTree } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import type { BlogBlock, BlogPost } from '../content/types';
import { PostMeta } from './PostMeta';

/**
 * One journal article. Header + hero photo above the fold, a readable ~65ch column, and a table of
 * contents — a sticky aside from `lg`, a native `<details>` disclosure on phones/tablets (no JS).
 * Ends with a shop CTA and the other posts. Server component.
 */
export function BlogArticle({ post, related }: { post: BlogPost; related: readonly BlogPost[] }) {
  const headings = post.blocks.filter((b): b is Extract<BlogBlock, { type: 'h2' }> => b.type === 'h2');
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <Breadcrumbs
        className="mb-6"
        items={[
          { name: 'Journal', href: '/blog' },
          { name: post.title, href: `/blog/${post.slug}` },
        ]}
      />

      <article aria-labelledby="post-title" data-testid="blog-article">
        <header className="grid max-w-3xl gap-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">{post.eyebrow}</p>
          <h1
            id="post-title"
            className="font-serif text-4xl leading-[1.1] font-medium text-balance text-foreground md:text-5xl"
          >
            {post.title}
          </h1>
          <p className="text-lg leading-relaxed text-pretty text-muted-foreground">{post.description}</p>
          <PostMeta post={post} />
        </header>

        <div className="relative mt-8 aspect-16/9 overflow-hidden rounded-2xl bg-muted md:mt-10 lg:aspect-21/9">
          <Image
            src={post.image.src}
            alt={post.image.alt}
            fill
            sizes="(min-width: 1152px) 1088px, 100vw"
            preload
            fetchPriority="high"
            className="object-cover"
          />
        </div>

        <div className="mt-8 grid gap-8 md:mt-12 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
          <aside className="lg:order-2">
            <details className="group rounded-lg border border-border bg-card lg:hidden">
              <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <ListTree aria-hidden="true" className="size-4 text-accent-foreground" />
                In this article
                <span
                  aria-hidden="true"
                  className="ml-auto text-muted-foreground transition-transform group-open:rotate-90"
                >
                  <ArrowRight className="size-4" />
                </span>
              </summary>
              <Toc headings={headings} className="border-t border-border px-4 py-3" />
            </details>
            <nav aria-label="In this article" className="sticky top-24 hidden lg:block">
              <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                In this article
              </p>
              <Toc headings={headings} className="border-l border-border" />
            </nav>
          </aside>

          <div className="grid max-w-prose content-start gap-5 text-base leading-relaxed text-foreground/85 md:text-lg">
            {post.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </div>
      </article>

      <section
        aria-labelledby="post-cta-title"
        className="mt-14 grid gap-5 rounded-2xl bg-secondary p-6 text-secondary-foreground sm:p-8 md:mt-20 md:grid-cols-[1fr_auto] md:items-center md:p-10"
      >
        <div className="grid gap-2">
          <h2 id="post-cta-title" className="font-serif text-2xl font-medium text-balance md:text-3xl">
            Taste the batch that&rsquo;s shipping now
          </h2>
          <p className="text-secondary-foreground/80">
            Small batches, sealed under mustard oil, with the batch code and dates on every jar.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
          <Link href="/products" className={cn(buttonVariants({ size: 'lg' }), 'focus-visible:ring-offset-secondary')}>
            Shop pickles
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/faq"
            className={cn(
              buttonVariants({ size: 'lg', variant: 'outline' }),
              'border-secondary-foreground/30 bg-transparent text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground',
            )}
          >
            Read the FAQ
          </Link>
        </div>
      </section>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-14 grid gap-4">
          <h2 id="related-title" className="font-serif text-2xl font-medium text-foreground">
            More from the journal
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {related.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors outline-none hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <span className="grid gap-1">
                    <span className="text-xs font-semibold tracking-[0.14em] text-accent-foreground uppercase">
                      {p.eyebrow}
                    </span>
                    <span className="font-serif text-lg leading-snug font-medium text-foreground">{p.title}</span>
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-accent-foreground transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Toc({ headings, className }: { headings: { id: string; text: string }[]; className?: string }) {
  return (
    <ol className={cn('grid gap-0.5 text-sm', className)}>
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className="-ml-px flex min-h-11 items-center border-l-2 border-transparent pl-3 text-muted-foreground outline-none hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          id={block.id}
          className="mt-6 scroll-mt-24 font-serif text-2xl leading-snug font-medium text-balance text-foreground md:text-3xl"
        >
          {block.text}
        </h2>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List className={cn('grid gap-2.5 pl-6', block.ordered ? 'list-decimal' : 'list-disc', 'marker:text-primary')}>
          {block.items.map((item) => (
            <li key={item} className="pl-1.5">
              {item}
            </li>
          ))}
        </List>
      );
    }
    case 'note':
      return (
        <aside className="flex gap-3 rounded-lg border border-l-4 border-border border-l-primary bg-card p-4 md:p-5">
          <Lightbulb aria-hidden="true" className="mt-1 size-5 shrink-0 text-accent-foreground" />
          <div className="grid gap-1">
            <p className="font-semibold text-foreground">{block.title}</p>
            <p className="text-base">{block.text}</p>
          </div>
        </aside>
      );
    default:
      return <p className="text-pretty">{block.text}</p>;
  }
}
