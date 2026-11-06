import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkReadiness, parseEnv, publicHttpsIssue } from '../check-launch-readiness.mjs';

const PROD_OK = {
  NODE_ENV: 'production',
  LAUNCH_MODE: 'live',
  DOCKER_STOREFRONT_URL: 'https://pahadikhatki.in',
  DOCKER_ASSETS_BASE_URL: 'https://img.pahadikhatki.in',
  DOCKER_API_PUBLIC_URL: 'https://pahadikhatki.in',
  TRUST_PROXY: 'true',
  COOKIE_DOMAIN: '.pahadikhatki.in',
  PAYMENT_GATEWAY: 'razorpay',
  SHIPPING_PROVIDER: 'shiprocket',
  WHATSAPP_PROVIDER: 'cloud',
  SMS_PROVIDER: 'msg91',
  OTP_PROVIDER: 'msg91',
  STORAGE_DRIVER: 's3',
  STAGING_HTTPS: 'on',
  NEXT_PUBLIC_SELLER_LEGAL_NAME: 'Example Foods',
  NEXT_PUBLIC_SELLER_ADDRESS: 'Kangra, HP',
  NEXT_PUBLIC_SELLER_FSSAI_NO: '12345678901234',
  NEXT_PUBLIC_SELLER_GSTIN: '02ABCDE1234F1Z5',
  NEXT_PUBLIC_SELLER_PHONE: '+91 98765 43210',
  NEXT_PUBLIC_SELLER_EMAIL: 'care@example.in',
  NEXT_PUBLIC_SELLER_GRIEVANCE_NAME: 'A. Officer',
  NEXT_PUBLIC_SELLER_GRIEVANCE_EMAIL: 'grievance@example.in',
};

test('parseEnv handles comments, quotes and blanks', () => {
  assert.deepEqual(parseEnv('# c\nA=1\nB="two words"\nC=\nD=x # trailing\n\nnoequals\n'), {
    A: '1',
    B: 'two words',
    C: '',
    D: 'x',
  });
});

test('publicHttpsIssue rejects http, localhost and private ranges', () => {
  assert.equal(publicHttpsIssue('X', 'https://pahadikhatki.in'), null);
  assert.match(publicHttpsIssue('X', 'http://pahadikhatki.in'), /https/);
  assert.match(publicHttpsIssue('X', 'https://localhost:3001'), /private host/);
  assert.match(publicHttpsIssue('X', 'https://192.168.1.5'), /private host/);
  assert.match(publicHttpsIssue('X', ''), /blank/);
});

test('a fully configured production .env is ready', () => {
  const r = checkReadiness(PROD_OK);
  assert.deepEqual(r.blockers, []);
  assert.equal(r.mode, 'live');
});

test('the audit state (blank public URLs, Pending facts) is blocked for a live launch', () => {
  const r = checkReadiness({ NODE_ENV: 'production', LAUNCH_MODE: 'live', STORAGE_DRIVER: 's3' });
  const text = r.blockers.join('\n');
  assert.match(text, /DOCKER_STOREFRONT_URL is blank/);
  assert.match(text, /DOCKER_ASSETS_BASE_URL is blank/);
  assert.match(text, /NEXT_PUBLIC_SELLER_FSSAI_NO is blank/);
  assert.match(text, /NEXT_PUBLIC_SELLER_GSTIN is blank/);
  assert.match(text, /COOKIE_DOMAIN/);
});

test('coming-soon mode downgrades legal facts and dev stand-ins to warnings but keeps URL blockers', () => {
  const r = checkReadiness({
    ...PROD_OK,
    LAUNCH_MODE: 'coming-soon',
    NEXT_PUBLIC_SELLER_GSTIN: '',
    PAYMENT_GATEWAY: 'mock',
  });
  assert.deepEqual(r.blockers, []);
  assert.match(r.warnings.join('\n'), /GSTIN is blank/);
  assert.match(r.warnings.join('\n'), /PAYMENT_GATEWAY=mock/);
  const r2 = checkReadiness({ ...PROD_OK, LAUNCH_MODE: 'coming-soon', DOCKER_STOREFRONT_URL: 'http://localhost:3001' });
  assert.match(r2.blockers.join('\n'), /DOCKER_STOREFRONT_URL must be https/);
});

test('malformed identifiers and dangerous switches are blockers in any mode', () => {
  const r = checkReadiness({
    ...PROD_OK,
    NEXT_PUBLIC_SELLER_FSSAI_NO: '123',
    NEXT_PUBLIC_SELLER_GSTIN: 'nope',
    NEXT_PUBLIC_SELLER_WHATSAPP: '9876543210',
    DEFAULT_OTP: '123456',
    TRUST_PROXY: 'false',
    ADMIN_TOTP_REQUIRED: 'false',
  });
  const text = r.blockers.join('\n');
  assert.match(text, /14-digit FSSAI/);
  assert.match(text, /valid 15-character GSTIN/);
  assert.match(text, /country code/);
  assert.match(text, /DEFAULT_OTP/);
  assert.match(text, /TRUST_PROXY/);
  assert.match(text, /ADMIN_TOTP_REQUIRED/);
});

test('--mode overrides LAUNCH_MODE and STAGING_HTTPS=off only warns', () => {
  const r = checkReadiness({ ...PROD_OK, LAUNCH_MODE: 'coming-soon', STAGING_HTTPS: 'off' }, { mode: 'live' });
  assert.equal(r.mode, 'live');
  assert.match(r.warnings.join('\n'), /STAGING_HTTPS=off/);
});
