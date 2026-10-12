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
