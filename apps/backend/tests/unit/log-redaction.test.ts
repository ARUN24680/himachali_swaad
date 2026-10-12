import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/config/logger';

/** Phase 10 §10.1: PII never reaches logs (Rules §2.2). */
describe('log redaction', () => {
  it('phone, email, address, OTP, tokens and cookies are redacted at any nesting the app uses', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const log = createLogger({ level: 'info', name: 'test', destination });
    log.info(
      {
        phone: '+919812345678',
        email: 'asha@example.com',
        address: { line1: '12 Mall Road' },
        otp: '123456',
        order: { phone: '+919812345678', email: 'asha@example.com', address: '12 Mall Road' },
        customer: { profile: { phone: '+919812345678' } },
        req: { headers: { authorization: 'Bearer abc', cookie: 'pk_at=secret' } },
        refreshToken: 'rt-secret',
      },
      'checkout',
    );
    const out = lines.join('');
    for (const leaked of [
      '+919812345678',
      'asha@example.com',
      'Mall Road',
      '123456',
      'Bearer abc',
      'pk_at=secret',
      'rt-secret',
    ]) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('[REDACTED]');
  });
});
