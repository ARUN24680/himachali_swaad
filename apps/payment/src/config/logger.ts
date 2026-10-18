import { createRequire } from 'node:module';
import { pino, type DestinationStream, type Logger } from 'pino';

const require = createRequire(import.meta.url);

/** Secrets and alert contents never reach logs (Rules §2.2) — bank alerts carry account + payer details. */
const SENSITIVE = ['secret', 'signature', 'text', 'body', 'raw', 'content', 'vpa', 'sender', 'utr'];
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-signature"]',
  ...SENSITIVE,
  ...SENSITIVE.map((k) => `*.${k}`),
];

export function createLogger(opts: { level: string; pretty?: boolean; destination?: DestinationStream }): Logger {
  let transport: { target: string; options: { colorize: boolean } } | undefined;
  if (opts.pretty && !opts.destination) {
    try {
      require.resolve('pino-pretty');
      transport = { target: 'pino-pretty', options: { colorize: true } };
    } catch {
      transport = undefined; // lean production image
    }
  }
  return pino(
    {
      level: opts.level,
      name: 'pk-payment',
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(transport ? { transport } : {}),
    },
    opts.destination,
  );
}
