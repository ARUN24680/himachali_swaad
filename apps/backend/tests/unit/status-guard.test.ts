import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** D-29 / Phase 5 §5.2: `orders.status` is written in exactly one place (transitionOrder's repository call). */
const SRC = join(import.meta.dirname, '../../src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('status writes', () => {
  it('only orders.repository updateOrderStatusGuarded sets orders.status', () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/UPDATE\s+orders\s+SET([\s\S]*?)(?:WHERE|RETURNING|`)/gi)) {
        if (/(^|[^_\w])status\s*=/.test(m[1]!)) offenders.push(relative(SRC, file));
      }
    }
    expect(offenders).toEqual(['modules/orders/orders.repository.ts']);
    const repo = readFileSync(join(SRC, 'modules/orders/orders.repository.ts'), 'utf8');
    expect(repo.match(/UPDATE\s+orders\s+SET\s+status/gi)).toHaveLength(1);
  });
});
