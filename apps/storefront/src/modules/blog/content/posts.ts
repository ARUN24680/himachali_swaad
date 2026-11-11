import { howKangraPickleIsMade } from './how-kangra-pickle-is-made';
import { howToStoreNonVegPickle } from './how-to-store-non-veg-pickle';
import type { BlogPost } from './types';

/** Newest first. Add a post = add a file + one line here (sitemap + static params pick it up). */
export const BLOG_POSTS: readonly BlogPost[] = [howKangraPickleIsMade, howToStoreNonVegPickle];

export const getPost = (slug: string): BlogPost | undefined => BLOG_POSTS.find((p) => p.slug === slug);
