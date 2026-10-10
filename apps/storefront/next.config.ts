import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript source (Just-in-Time packages)
  transpilePackages: ['@pk/ui', '@pk/shared'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default config;
