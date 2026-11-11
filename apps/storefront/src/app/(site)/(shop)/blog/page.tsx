import type { Metadata } from 'next';
import { BLOG_POSTS, BlogIndex } from '@/modules/blog';

export const metadata: Metadata = {
  title: 'Journal — Himachali pickle making, storage & traditions',
  description:
    'How traditional Kangra pickle is made, how to store Himachali non-veg pickle and the hill-kitchen habits behind every jar.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return <BlogIndex posts={BLOG_POSTS} />;
}
