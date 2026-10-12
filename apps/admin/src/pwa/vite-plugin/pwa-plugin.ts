import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { PWA_COLORS } from '../brand-colors';
import { OUTBOX, SW_MESSAGES, SW_URL } from '../constants';

/**
 * Packing Desk PWA build step (Phase 7 §7.2) — a tiny in-repo replacement for vite-plugin-pwa:
 *  - emits `manifest.webmanifest` (colours from ../brand-colors, verified against globals.css),
 *  - emits `sw.js` from ../sw.js with the real build output injected as the precache list,
 *  - adds manifest / theme-color / apple-touch-icon tags to index.html.
 * In dev the manifest is served from memory; the SW only with `devServiceWorker` (VITE_PWA_DEV=true).
 */
export interface PkPwaOptions {
  apiUrl: string;
  /** Absolute path of packages/ui/src/styles/globals.css (token source of truth). */
  tokensCss: string;
  /** Absolute path of src/pwa/sw.js (the template). */
  swSource: string;
  devServiceWorker?: boolean;
}

/** Fails loudly when a manifest colour no longer matches its token (Rules §1.4 single source). */
export function assertColorsMatchTokens(css: string): void {
  const block = (selector: RegExp) => selector.exec(css)?.[1] ?? '';
  const light = block(/:root,\s*\.light\s*\{([^}]*)\}/);
  const dark = block(/\.dark\s*\{([^}]*)\}/);
  const token = (scope: string, name: string) =>
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(scope)?.[1]?.toLowerCase();
  const checks: [string, string | undefined, string][] = [
    ['light --secondary', token(light, 'secondary'), PWA_COLORS.light.secondary],
    ['light --background', token(light, 'background'), PWA_COLORS.light.background],
    ['dark --secondary', token(dark, 'secondary'), PWA_COLORS.dark.secondary],
    ['dark --background', token(dark, 'background'), PWA_COLORS.dark.background],
  ];
  const drift = checks.filter(([, actual, expected]) => actual !== expected.toLowerCase());
  if (drift.length) {
    throw new Error(
      `PWA colours drifted from globals.css — update src/pwa/brand-colors.ts:\n${drift
        .map(([name, actual, expected]) => `  ${name}: token ${actual ?? 'missing'} ≠ ${expected}`)
        .join('\n')}`,
    );
  }
}

export function webManifest() {
  return {
    id: '/desk',
    name: 'Pahadi Khatki — Packing Desk',
    short_name: 'PK Desk',
    description: 'Kitchen partner packing desk: orders, labels, batches.',
    start_url: '/desk',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'hi-Latn',
    dir: 'ltr',
    theme_color: PWA_COLORS.light.secondary,
    background_color: PWA_COLORS.light.background,
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function serviceWorker(swSource: string, precache: string[], apiUrl: string, version: string): string {
  const build = { version, precache, apiUrl, outbox: OUTBOX, messages: SW_MESSAGES };
  return readFileSync(swSource, 'utf8').replace('__PK_BUILD__;', `${JSON.stringify(build)};`);
}

function publicFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (!entry.startsWith('.')) out.push(`/${relative(dir, full).split(sep).join('/')}`);
    }
  };
  try {
    walk(dir);
  } catch {
    /* no public dir */
  }
  return out;
}

export function pkPwa({ apiUrl, tokensCss, swSource, devServiceWorker = false }: PkPwaOptions): Plugin {
  let publicDir = '';
  const manifestJson = () => JSON.stringify(webManifest(), null, 2);

  return {
    name: 'pk-pwa',
    configResolved(config) {
      publicDir = config.publicDir;
      assertColorsMatchTokens(readFileSync(tokensCss, 'utf8'));
    },
    transformIndexHtml() {
      const meta = (attrs: Record<string, string>) => ({ tag: 'meta', attrs, injectTo: 'head' as const });
      const link = (attrs: Record<string, string>) => ({ tag: 'link', attrs, injectTo: 'head' as const });
      return [
        link({ rel: 'manifest', href: '/manifest.webmanifest' }),
        link({ rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' }),
        link({ rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }),
        meta({ name: 'theme-color', content: PWA_COLORS.light.secondary, media: '(prefers-color-scheme: light)' }),
        meta({ name: 'theme-color', content: PWA_COLORS.dark.secondary, media: '(prefers-color-scheme: dark)' }),
        meta({ name: 'mobile-web-app-capable', content: 'yes' }),
        meta({ name: 'apple-mobile-web-app-capable', content: 'yes' }),
        meta({ name: 'apple-mobile-web-app-title', content: 'PK Desk' }),
        meta({ name: 'apple-mobile-web-app-status-bar-style', content: 'black' }),
      ];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/manifest.webmanifest') {
          res.setHeader('content-type', 'application/manifest+json');
          res.end(manifestJson());
          return;
        }
        if (devServiceWorker && req.url === SW_URL) {
          res.setHeader('content-type', 'text/javascript');
          res.setHeader('service-worker-allowed', '/');
          res.end(
            serviceWorker(
              swSource,
              ['/offline.html', ...publicFiles(publicDir).filter((f) => f !== '/offline.html')],
              apiUrl,
              'dev',
            ),
          );
          return;
        }
        next();
      });
    },
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifestJson() });
      const built = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .map((f) => `/${f}`);
      const precache = [
        ...new Set(['/index.html', '/manifest.webmanifest', ...built, ...publicFiles(publicDir)]),
      ].sort();
      const version = createHash('sha256')
        .update(precache.join('\n'))
        .update(readFileSync(swSource))
        .digest('hex')
        .slice(0, 12);
      this.emitFile({
        type: 'asset',
        fileName: SW_URL.slice(1),
        source: serviceWorker(swSource, precache, apiUrl, version),
      });
    },
  };
}
