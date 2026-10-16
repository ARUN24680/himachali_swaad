import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { pkPwa } from './src/pwa/vite-plugin/pwa-plugin';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path('.'), ['VITE_', 'INTERNAL_API_URL']);
  const apiTarget = env.INTERNAL_API_URL || env.VITE_API_URL || 'http://127.0.0.1:4000';
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Packing Desk PWA (Phase 7 §7.2): manifest, service worker, theme-color tags
      pkPwa({
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
    build: { sourcemap: true },
  };
});
