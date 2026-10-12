#!/usr/bin/env node
// Renders the Packing Desk PWA icons (Phase 7 §7.2) from one SVG mark with Playwright's Chromium —
// no image dependency. Run: `pnpm --filter @pk/admin icons` (outputs to public/icons/, committed).
// Colours mirror globals.css tokens (--secondary, --primary, --background) like src/pwa/brand-colors.ts;
// icons are raster files, so they can't read CSS variables.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const PINE = '#121a16'; // pk-allow-color --secondary (light)
const GOLD = '#d4a359'; // pk-allow-color --primary (light)
const IVORY = '#f8f5ef'; // pk-allow-color --background (light)

/** Mountain mark on a 512 grid; `scale` shrinks it into the maskable safe zone. */
const mark = (fill, cap, scale = 1) => {
  const t = (256 * (1 - scale)).toFixed(1);
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M88 392 L208 152 L282 290 L338 226 L428 392 Z" fill="${fill}"/>
    ${cap ? `<path d="M208 152 L228 192 L216 186 L205 200 L193 192 L180 208 Z" fill="${cap}"/>` : ''}
  </g>`;
};

const svg = ({ rounded, scale, mono }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${mono ? '' : `<rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="${PINE}"/>`}
  ${mono ? mark('#fff', null, scale) /* pk-allow-color — badge is alpha-only */ : mark(GOLD, IVORY, scale)}
</svg>`;

const ICONS = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  { file: 'maskable-512.png', size: 512, rounded: false, scale: 0.72 }, // 80 % safe zone
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.86 }, // iOS rounds the corners itself
  { file: 'badge-96.png', size: 96, mono: true, scale: 1 }, // Android status-bar badge (alpha mask)
];

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), svg({ rounded: true, scale: 1 }));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(icon).replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: join(OUT, icon.file), omitBackground: true });
  console.log(`✔ public/icons/${icon.file}`);
}
await browser.close();
