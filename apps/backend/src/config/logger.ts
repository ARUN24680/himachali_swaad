import { pino, type Logger, type DestinationStream } from 'pino';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** PII and secrets never reach logs (Rules §2.2): phone, email, address, OTP, tokens, cookies, payment payloads. */
const SENSITIVE_KEYS = [
  'phone',
  'email',
  'address',
  'password',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
];

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  ...SENSITIVE_KEYS.map((k) => `*.*.${k}`),
];

export interface LoggerOptions {
  level: string;
  name: string;
  pretty?: boolean;
  destination?: DestinationStream;
}

export function createLogger({ level, name, pretty, destination }: LoggerOptions): Logger {
  let transport: { target: string; options: { colorize: boolean } } | undefined;
  if (pretty && !destination) {
    try {
      // Only attach pino-pretty if available in runtime
      require.resolve('pino-pretty');
      transport = { target: 'pino-pretty', options: { colorize: true } };
    } catch {
      // If pino-pretty is not installed (e.g. lean production container), standard JSON output is used
      transport = undefined;
    }
  }

  return pino(
    {
      level,
      name,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(transport ? { transport } : {}),
    },
    destination,
  );
}
