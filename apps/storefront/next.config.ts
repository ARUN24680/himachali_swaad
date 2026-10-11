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

const imagePattern = imageRemotePattern();
/**
 * Next 16 refuses to optimise images from private IPs (SSRF guard). Allow it ONLY when images are
 * served by the local dev backend (localhost /dev-assets, STORAGE_DRIVER=local) — never for a CDN host.
 */
const localImageOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(imagePattern.hostname);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Keeps dev-server screenshots (Phase evidence) free of the floating Next badge
  devIndicators: false,
  // Workspace packages ship TypeScript source (Just-in-Time packages)
  transpilePackages: ['@pk/ui', '@pk/shared'],
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [imagePattern],
    dangerouslyAllowLocalIP: localImageOrigin,
  },
};

export default config;
