import { pino, type Logger, type DestinationStream } from 'pino';

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
  return pino(
    {
      level,
      name,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(pretty && !destination ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    },
    destination,
  );
}
