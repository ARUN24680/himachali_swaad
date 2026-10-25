import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { isAdminLocked } from './src/lib/launch-mode';
import { pkPwa } from './src/pwa/vite-plugin/pwa-plugin';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Locked builds: a neutral <title> and no brand icon in index.html (the app shows only a 404). The
 * public dir (PWA icons, offline page) is skipped; only `_headers` (the CSP) is still shipped.
 */
function lockedHtml(): Plugin {
  return {
    name: 'pk-locked-html',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: readFileSync(path('./public/_headers'), 'utf8') });
    },
    transformIndexHtml: (html) =>
      html.replace(/<title>[^<]*<\/title>/, '<title>Page not found</title>').replace(/\s*<link rel="icon"[^>]*>/, ''),
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, path('.'), ['VITE_', 'INTERNAL_API_URL']);
  const apiTarget = env.INTERNAL_API_URL || env.VITE_API_URL || 'http://127.0.0.1:4000';
  // Pre-launch lock (src/lib/launch-mode.ts): production builds show only a 404 unless VITE_LAUNCH_MODE=live.
  const locked = isAdminLocked({
    production: command === 'build',
    launchMode: process.env.VITE_LAUNCH_MODE ?? env.VITE_LAUNCH_MODE,
  });
  return {
    base: process.env.VITE_BASE_PATH || '/admin/',
    define: { __PK_ADMIN_LOCKED__: JSON.stringify(locked) },
    plugins: [
      react(),
      tailwindcss(),
      // Packing Desk PWA (Phase 7 §7.2): manifest, service worker, theme-color tags — not in a locked build
      locked
        ? lockedHtml()
        : pkPwa({
            apiUrl: env.VITE_API_URL ?? '',
            tokensCss: path('../../packages/ui/src/styles/globals.css'),
            swSource: path('./src/pwa/sw.js'),
            devServiceWorker: env.VITE_PWA_DEV === 'true',
          }),
    ],
    resolve: {
      alias: { '@': path('./src') },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      fs: { allow: [path('../../')] },
      proxy: {
        '/api/v1': { target: apiTarget, proxyTimeout: 15_000 },
        '/dev-assets': { target: apiTarget, proxyTimeout: 15_000 },
      },
    },
    publicDir: locked ? false : 'public',
    build: { sourcemap: !locked },
  };
});
