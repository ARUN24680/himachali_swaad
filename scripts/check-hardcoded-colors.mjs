#!/usr/bin/env node
// Fails CI when a component uses a hardcoded colour instead of a semantic token (Rules §1.4).
// Allowed escape hatch (rare, e.g. <meta name="theme-color">): put `pk-allow-color` in a comment on the same line.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX =
  'bg|text|border(?:-[trblxyse])?|ring|ring-offset|outline|from|via|to|fill|stroke|decoration|divide|placeholder|shadow|accent|caret';

const RULES = [
  {
    name: 'tailwind-palette',
    re: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${PREFIX})-(?:${PALETTE})-\\d{2,3}(?:\\/\\d+)?(?![\\w-])`, 'g'),
  },
  {
    name: 'tailwind-black-white',
    re: new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${PREFIX})-(?:black|white)(?:\\/\\d+)?(?![\\w-])`, 'g'),
  },
  {
    name: 'arbitrary-color',
    re: /(?<![\w-])(?:[\w-]+:)*[a-z-]+-\[(?:#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color-mix\()[^\]]*\]/g,
  },
  { name: 'hex-literal', re: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g },
  { name: 'color-function', re: /(?<![\w-])(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/g },
];

const ALLOW = 'pk-allow-color';
const SCAN_ROOTS = ['apps/storefront/src', 'apps/admin/src', 'packages/ui/src'];
const EXTENSIONS = /\.(?:tsx?|jsx?|css)$/;
// The token file is the ONLY place literal colours may live
const TOKEN_FILES = new Set(['packages/ui/src/styles/globals.css']);

export function findViolations(text, file = 'inline.tsx') {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes(ALLOW)) return;
    const hits = RULES.flatMap((rule) =>
      [...line.matchAll(rule.re)].map((m) => ({
        rule: rule.name,
        match: m[0],
        start: m.index,
        end: m.index + m[0].length,
      })),
    ).sort((a, b) => a.start - b.start || b.end - a.end);
    let coveredUntil = -1;
    for (const h of hits) {
      if (h.start < coveredUntil) continue; // e.g. the #hex inside bg-[#hex] is one violation, not two
      coveredUntil = h.end;
      out.push({ file, line: i + 1, rule: h.rule, match: h.match });
    }
  });
  return out;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.test(entry)) yield full;
  }
}

function main(root) {
  const violations = [];
  for (const scanRoot of SCAN_ROOTS) {
    let files;
    try {
      files = [...walk(join(root, scanRoot))];
    } catch {
      continue;
    }
    for (const full of files) {
      const rel = relative(root, full).split(sep).join('/');
      if (TOKEN_FILES.has(rel)) continue;
      violations.push(...findViolations(readFileSync(full, 'utf8'), rel));
    }
  }
  if (violations.length) {
    console.error(`✖ ${violations.length} hardcoded colour(s) found — use semantic tokens (Rules §1.4):\n`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.match}  [${v.rule}]`);
    process.exit(1);
  }
  console.log('✔ No hardcoded colours.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.cwd());
