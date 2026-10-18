// Direct UPI pay page (Phase 5A, D-59). Built into ../dist/web and served by the payment service at
// /pay/:id under a strict CSP (no inline script/style, self-hosted fonts) — keep every asset a file.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: path('.'),
  base: '/pay/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    fs: { allow: [path('../../../')] },
    proxy: { '/pay/api': { target: 'http://localhost:4100', proxyTimeout: 15_000 } },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    sourcemap: 'hidden', // maps for error tooling, not linked from the public bundle
    // font-src is 'self' only (no data:) — never inline fonts/images as data: URIs
    assetsInlineLimit: 0,
  },
});
