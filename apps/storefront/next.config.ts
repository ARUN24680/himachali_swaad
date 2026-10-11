import type { NextConfig } from 'next';

/**
 * Product images come only from the image CDN (D-11) — R2 public bucket domain in production,
 * the backend's dev-assets route locally (STORAGE_DRIVER=local).
 */
function imageRemotePattern(): URL {
  const base =
    process.env.NEXT_PUBLIC_ASSETS_BASE_URL ||
    `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '')}/dev-assets`;
  return new URL(`${base.replace(/\/+$/, '')}/products/**`);
}

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source (Just-in-Time packages)
  transpilePackages: ['@pk/ui', '@pk/shared'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [imageRemotePattern()],
  },
};

export default config;
