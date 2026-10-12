import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Phase 7 evidence folder (Phases/evidence/phase-07/). */
export const EVIDENCE = fileURLToPath(new URL('../../../../../Phases/evidence/phase-07/', import.meta.url));

/** Merge one section into Phases/evidence/phase-07/<file> (tests run serially, so read-modify-write is safe). */
export function recordEvidence(file: string, section: string, value: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const path = `${EVIDENCE}${file}`;
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    /* first write */
  }
  current[section] = value;
  current.generatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
}

export function writeEvidenceText(file: string, text: string): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(`${EVIDENCE}${file}`, text);
}
