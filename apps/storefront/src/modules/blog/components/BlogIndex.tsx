import { BookOpen } from 'lucide-react';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { SectionHeading } from '@/components/common/SectionHeading';
import { StateMessage } from '@/components/common/StateMessage';
import type { BlogPost } from '../content/types';
import { PostCard } from './PostCard';

/** /blog — the journal index. Static, server-rendered, no client JS. */
export function BlogIndex({ posts }: { posts: readonly BlogPost[] }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:px-8 md:py-14">
      <div className="grid gap-6">
        <Breadcrumbs items={[{ name: 'Journal', href: '/blog' }]} />
        <SectionHeading
          as="h1"
          eyebrow="The journal"
          title="Notes from a Himachal kitchen"
          lead="How our pickles are made, how to keep them at their best, and the hill traditions behind every jar."
        />
      </div>
      {posts.length === 0 ? (
        <StateMessage
          icon={<BookOpen />}
          title="The first notes are on their way"
          description="We are writing them in the kitchen between batches. Please check back soon."
        />
      ) : (
        <ul className="grid gap-6 md:grid-cols-2" data-testid="post-list">
          {posts.map((post, i) => (
            <li key={post.slug}>
              <PostCard post={post} priority={i === 0} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
