#!/usr/bin/env node
// Packing Desk i18n lint (Phase 7 §7.4 "koi untranslated string nahi"). Fails when:
//  1. hi/ and en/ dictionaries don't have exactly the same keys,
//  2. a translation drops or adds a {placeholder},
//  3. a desk screen renders a raw string literal in JSX text or in aria-label/placeholder/title/alt.
// Escape hatch for a deliberate literal: put `i18n-ignore` in a comment on the same line.
// Run: pnpm --filter @pk/admin check:i18n
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const I18N = join(ROOT, 'src', 'i18n');
const LANGS = ['en', 'hi'];
const SCAN = [join(ROOT, 'src', 'modules', 'packing-desk'), join(ROOT, 'src', 'layouts', 'PartnerLayout.tsx')];

const errors = [];

function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out.set(prefix + k, v);
    else if (v && typeof v === 'object') flatten(v, `${prefix}${k}.`, out);
    else errors.push(`${prefix}${k}: value must be a string or object`);
  }
  return out;
}

const placeholders = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

// ── 1 + 2: dictionary parity ───────────────────────────────────────────
const files = new Set(LANGS.flatMap((l) => readdirSync(join(I18N, l)).filter((f) => f.endsWith('.json'))));
let keyCount = 0;
for (const file of files) {
  const dicts = Object.fromEntries(
    LANGS.map((l) => {
      try {
        return [l, flatten(JSON.parse(readFileSync(join(I18N, l, file), 'utf8')))];
      } catch (e) {
        errors.push(`${l}/${file}: ${e.code === 'ENOENT' ? 'missing file' : e.message}`);
        return [l, new Map()];
      }
    }),
  );
  const [base, ...others] = LANGS;
  keyCount += dicts[base].size;
  for (const other of others) {
    for (const key of dicts[base].keys())
      if (!dicts[other].has(key)) errors.push(`${other}/${file}: missing key "${key}"`);
    for (const key of dicts[other].keys())
      if (!dicts[base].has(key)) errors.push(`${base}/${file}: missing key "${key}" (present in ${other})`);
    for (const [key, text] of dicts[base]) {
      const theirs = dicts[other].get(key);
      if (theirs !== undefined && placeholders(text) !== placeholders(theirs))
        errors.push(`${other}/${file}: "${key}" placeholders {${placeholders(theirs)}} ≠ en {${placeholders(text)}}`);
      if (theirs !== undefined && !theirs.trim()) errors.push(`${other}/${file}: "${key}" is empty`);
    }
  }
}

// ── 3: raw literals in desk JSX ─────────────────────────────────────────
function* walk(p) {
  if (statSync(p).isDirectory()) for (const e of readdirSync(p)) yield* walk(join(p, e));
  else if (p.endsWith('.tsx')) yield p;
}
const JSX_TEXT = />([^<>{}]*\p{L}[^<>{}]*)</gu;
const ATTR = /\b(aria-label|placeholder|title|alt)="([^"]*\p{L}[^"]*)"/gu;
let scanned = 0;
for (const root of SCAN) {
  for (const file of walk(root)) {
    scanned++;
    const rel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) // keep line numbers
      .split('\n');
    src.forEach((line, i) => {
      if (line.includes('i18n-ignore') || /^\s*\/\//.test(line)) return;
      const code = line.replace(/\/\/.*$/, '');
      for (const m of code.matchAll(JSX_TEXT)) {
        const text = m[1].trim();
        // `a > b && c < d`-style expressions aren't JSX text
        if (!text || /[=;()&|?]/.test(text)) continue;
        errors.push(`${rel}:${i + 1}: raw JSX text "${text}" — use t()`);
      }
      for (const m of code.matchAll(ATTR)) errors.push(`${rel}:${i + 1}: raw ${m[1]}="${m[2]}" — use t()`);
    });
  }
}

if (errors.length) {
  console.error(`✖ i18n check failed (${errors.length}):\n${errors.map((e) => `  ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`✔ i18n: ${keyCount} keys identical in ${LANGS.join(' + ')}; ${scanned} desk files free of raw strings.`);
