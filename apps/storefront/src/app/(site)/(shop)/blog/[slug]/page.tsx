import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/common/JsonLd';
import { articleJsonLd } from '@/lib/seo';
import { BLOG_POSTS, BlogArticle, getPost, wordCount } from '@/modules/blog';

interface Props {
  params: Promise<{ slug: string }>;
}

/** Every post is prebuilt; an unknown slug is a 404, not an on-demand render. */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: 'Article not found', robots: { index: false } };
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      images: [{ url: post.image.src, alt: post.image.alt }],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  return (
    <>
      <BlogArticle post={post} related={BLOG_POSTS.filter((p) => p.slug !== post.slug)} />
      <JsonLd
        data={articleJsonLd({
          slug: post.slug,
          title: post.title,
          description: post.description,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          image: post.image.src,
          wordCount: wordCount(post),
          keywords: post.keywords,
        })}
      />
    </>
  );
}
