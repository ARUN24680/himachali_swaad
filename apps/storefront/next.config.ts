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

const isDev = process.env.NODE_ENV !== 'production';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').origin;

/**
 * Security headers (Phase 10 §10.1, D-57). script-src keeps 'unsafe-inline' for Next's inline
 * hydration scripts — a nonce would make every page dynamic (no ISR / static product pages);
 * everything else is an explicit allowlist: Razorpay Checkout, GA4 + Meta Pixel (consent-gated),
 * Sentry, the API and the image CDN.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com https://www.googletagmanager.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${imagePattern.origin} https://*.razorpay.com https://www.facebook.com https://www.googletagmanager.com https://*.google-analytics.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://api.razorpay.com https://lumberjack.razorpay.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://*.ingest.sentry.io https://*.ingest.us.sentry.io${isDev ? ' ws: http://localhost:*' : ''}`,
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.razorpay.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com")',
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
