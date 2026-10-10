import { Writable } from 'node:stream';
import { createLogger } from '../../src/config/logger';

export const silentLogger = () => createLogger({ level: 'silent', name: 'pk-test' });

/** Logger that keeps every JSON line in memory so tests can assert on log content. */
export function capturingLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      for (const line of String(chunk).split('\n').filter(Boolean)) lines.push(JSON.parse(line));
      cb();
    },
  });
  return { logger: createLogger({ level: 'info', name: 'pk-test', destination }), lines };
}
