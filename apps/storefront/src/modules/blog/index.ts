/** Public API of the blog (journal) module — app/ routes and the sitemap import only from here. */
export { BlogArticle } from './components/BlogArticle';
export { BlogIndex } from './components/BlogIndex';
export { BLOG_POSTS, getPost } from './content/posts';
export type { BlogPost } from './content/types';
export { readingMinutes, wordCount } from './lib/reading';
