import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';

/** Phase 9 screenshot evidence (Phases/evidence/phase-09/), only when PK_EVIDENCE=1 so normal runs stay fast. */
export const EVIDENCE = fileURLToPath(new URL('../../../../../Phases/evidence/phase-09/', import.meta.url));
const enabled = process.env.PK_EVIDENCE === '1';

const VIEWPORT: Record<string, string> = { 'mobile-375': '375', 'tablet-768': '768', 'desktop-1440': '1440' };

export async function evidenceShot(
  page: Page,
  info: TestInfo,
  name: string,
  scheme: 'light' | 'dark',
  fullPage = true,
) {
  if (!enabled) return;
  mkdirSync(EVIDENCE, { recursive: true });
  // Let entry animations / skeleton swaps settle before the shot
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `${EVIDENCE}${name}-${VIEWPORT[info.project.name] ?? info.project.name}-${scheme}.png`,
    fullPage,
  });
}

/** Phase 10 evidence (Phases/evidence/phase-10/), PK_EVIDENCE=1 only. Phone shots at 390 px, desktop at 1440. */
export const EVIDENCE_10 = fileURLToPath(new URL('../../../../../Phases/evidence/phase-10/', import.meta.url));
export const EVIDENCE_ON = enabled;

export async function phase10Shot(
  page: Page,
  name: string,
  width: 390 | 1440,
  scheme: 'light' | 'dark',
  fullPage = true,
) {
  if (!enabled) return;
  mkdirSync(EVIDENCE_10, { recursive: true });
  // Full-page shots from the top, so the sticky top bar sits where it belongs
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${EVIDENCE_10}${name}-${width}-${scheme}.png`, fullPage });
}

/** Website-audit fixes (Phases/evidence/audit-2026-11/), PK_EVIDENCE=1 only. 375 / 768 / 1440, light + dark. */
export const EVIDENCE_AUDIT = fileURLToPath(new URL('../../../../../Phases/evidence/audit-2026-11/', import.meta.url));

export async function auditShot(page: Page, info: TestInfo, name: string, scheme: 'light' | 'dark', fullPage = true) {
  if (!enabled) return;
  mkdirSync(EVIDENCE_AUDIT, { recursive: true });
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `${EVIDENCE_AUDIT}${name}-${VIEWPORT[info.project.name] ?? info.project.name}-${scheme}.png`,
    fullPage,
  });
}
