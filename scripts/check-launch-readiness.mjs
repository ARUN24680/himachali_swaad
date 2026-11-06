#!/usr/bin/env node
/**
 * Launch-readiness gate (audit 2026-11-03, M-9). Reads a .env file (default: ./.env) and refuses a
 * production storefront deploy that would ship with Pending legal facts, http:// or localhost public
 * URLs, or a disabled security switch. Run by scripts/deploy.sh before every storefront deploy, and
 * usable on its own:  node scripts/check-launch-readiness.mjs --env .env [--mode live|coming-soon]
 *
 * Exit codes: 0 ready · 1 blocked · 2 usage/file error. No dependencies (plain Node ≥ 20).
 */
import { readFileSync } from 'node:fs';

/** Minimal .env parser: KEY=value, optional quotes, `#` comments, no interpolation. */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|0\.0\.0\.0)/i;

/** Must be a public https URL (no localhost / private network / http). */
export function publicHttpsIssue(name, value) {
  if (!value) return `${name} is blank`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return `${name} is not a URL: ${value}`;
  }
  if (url.protocol !== 'https:') return `${name} must be https:// (got ${url.protocol}//)`;
  if (PRIVATE_HOST.test(url.hostname)) return `${name} points at a private host: ${url.hostname}`;
  return null;
}

/** Launch-blocking seller facts (Consumer Protection (E-Commerce) Rules 2020 + FSSAI + Razorpay KYC). */
export const SELLER_REQUIRED = [
  'NEXT_PUBLIC_SELLER_LEGAL_NAME',
  'NEXT_PUBLIC_SELLER_ADDRESS',
  'NEXT_PUBLIC_SELLER_FSSAI_NO',
  'NEXT_PUBLIC_SELLER_GSTIN',
  'NEXT_PUBLIC_SELLER_PHONE',
  'NEXT_PUBLIC_SELLER_EMAIL',
  'NEXT_PUBLIC_SELLER_GRIEVANCE_NAME',
  'NEXT_PUBLIC_SELLER_GRIEVANCE_EMAIL',
];
/** Nice to have before launch; reported as warnings. */
export const SELLER_RECOMMENDED = [
  'NEXT_PUBLIC_SELLER_WHATSAPP',
  'NEXT_PUBLIC_SELLER_SUPPORT_HOURS',
  'NEXT_PUBLIC_SELLER_GRIEVANCE_DESIGNATION',
  'NEXT_PUBLIC_SELLER_GRIEVANCE_PHONE',
  'NEXT_PUBLIC_POLICY_REFUND_TIMELINE',
  'NEXT_PUBLIC_POLICY_LAST_UPDATED',
];

const FSSAI_RE = /^\d{14}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

/**
 * @param {Record<string,string>} env
 * @param {{ mode?: 'live' | 'coming-soon' }} [opts]
 * @returns {{ blockers: string[]; warnings: string[]; mode: string }}
 */
export function checkReadiness(env, opts = {}) {
  const mode = opts.mode ?? (env.LAUNCH_MODE === 'live' ? 'live' : 'coming-soon');
  const blockers = [];
  const warnings = [];
  const isProd = (env.NODE_ENV ?? 'development') === 'production';

  // Public URLs compiled into the storefront image — wrong values = wrong canonicals / CSP (R-8, M-1).
  for (const name of ['DOCKER_STOREFRONT_URL']) {
    const issue = publicHttpsIssue(name, env[name]);
    if (issue) (isProd ? blockers : warnings).push(`${issue} (canonical URLs, sitemap, HSTS)`);
  }
  if (env.STORAGE_DRIVER === 's3' || isProd) {
    const issue = publicHttpsIssue('DOCKER_ASSETS_BASE_URL', env.DOCKER_ASSETS_BASE_URL);
    if (issue) {
      (env.STORAGE_DRIVER === 's3' ? blockers : warnings).push(
        `${issue} — product images / CSP img-src (set it to the S3 or CloudFront URL)`,
      );
    }
  }
  if (env.DOCKER_API_PUBLIC_URL && PRIVATE_HOST.test(new URL(env.DOCKER_API_PUBLIC_URL).hostname) && isProd) {
    warnings.push('DOCKER_API_PUBLIC_URL is a private host — links in WhatsApp/SMS messages will not open');
  }

  // Security switches behind nginx (M-2) + cookies.
  if (isProd) {
    if ((env.TRUST_PROXY ?? 'true') !== 'true')
      blockers.push('TRUST_PROXY must be true behind nginx (per-IP rate limits)');
    if (!env.COOKIE_DOMAIN || env.COOKIE_DOMAIN === 'localhost') blockers.push('COOKIE_DOMAIN must be the real domain');
    if (env.ADMIN_TOTP_REQUIRED === 'false') blockers.push('ADMIN_TOTP_REQUIRED=false is refused in production');
    if (env.DEFAULT_OTP) blockers.push('DEFAULT_OTP must be empty in production (fixed OTP = anyone can sign in)');
    if (env.OTP_DEV_STAFF_BYPASS_PHONES) blockers.push('OTP_DEV_STAFF_BYPASS_PHONES must be empty in production');
    for (const [name, bad] of [
      ['PAYMENT_GATEWAY', 'mock'],
      ['SHIPPING_PROVIDER', 'sandbox'],
      ['WHATSAPP_PROVIDER', 'mock'],
      ['SMS_PROVIDER', 'mock'],
      ['OTP_PROVIDER', 'mock'],
      ['STORAGE_DRIVER', 'local'],
    ]) {
      if ((env[name] ?? bad) === bad) (mode === 'live' ? blockers : warnings).push(`${name}=${bad} (dev stand-in)`);
    }
  }
  if (env.STAGING_HTTPS !== 'on')
    warnings.push('STAGING_HTTPS=off — staging is still served over plain HTTP (audit R-3)');

  // Legal facts (R-1/R-2): blockers only for a live launch; warnings while the lock is on.
  const bucket = mode === 'live' ? blockers : warnings;
  for (const name of SELLER_REQUIRED) if (!env[name]) bucket.push(`${name} is blank — shows "Pending" on the site`);
  for (const name of SELLER_RECOMMENDED) if (!env[name]) warnings.push(`${name} is blank (recommended)`);
  if (env.NEXT_PUBLIC_SELLER_FSSAI_NO && !FSSAI_RE.test(env.NEXT_PUBLIC_SELLER_FSSAI_NO)) {
    blockers.push('NEXT_PUBLIC_SELLER_FSSAI_NO must be the 14-digit FSSAI licence number');
  }
  if (env.NEXT_PUBLIC_SELLER_GSTIN && !GSTIN_RE.test(env.NEXT_PUBLIC_SELLER_GSTIN)) {
    blockers.push('NEXT_PUBLIC_SELLER_GSTIN is not a valid 15-character GSTIN');
  }
  if (env.NEXT_PUBLIC_SELLER_WHATSAPP && !/^91[6-9]\d{9}$/.test(env.NEXT_PUBLIC_SELLER_WHATSAPP)) {
    blockers.push('NEXT_PUBLIC_SELLER_WHATSAPP must be digits with country code, e.g. 919876543210');
  }
  if (mode === 'live' && env.VITE_LAUNCH_MODE && env.VITE_LAUNCH_MODE !== 'live') {
    warnings.push('VITE_LAUNCH_MODE is not live — the admin build stays locked');
  }
  return { blockers, warnings, mode };
}

function main(argv) {
  const args = argv.slice(2);
  let file = '.env';
  let mode;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') file = args[++i];
    else if (args[i] === '--mode') mode = args[++i];
    else if (args[i] === '-h' || args[i] === '--help') {
      console.log('Usage: node scripts/check-launch-readiness.mjs [--env .env] [--mode live|coming-soon]');
      return 0;
    }
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Cannot read ${file}: ${err.message}`);
    return 2;
  }
  const { blockers, warnings, mode: effective } = checkReadiness(parseEnv(text), { mode });
  console.log(`Launch readiness (${file}, mode=${effective})`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const b of blockers) console.log(`  ✖ ${b}`);
  if (blockers.length) {
    console.log(`\n${blockers.length} blocker(s). Fix them, or keep LAUNCH_MODE=coming-soon for a teaser-only deploy.`);
    return 1;
  }
  console.log(warnings.length ? `\nReady with ${warnings.length} warning(s).` : '\nReady.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv));
