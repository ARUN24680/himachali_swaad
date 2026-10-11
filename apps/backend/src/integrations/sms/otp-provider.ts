/**
 * OTP delivery (D-21). Providers are thin clients: no DB access, no business rules.
 * Live SMS needs TRAI DLT registration + approved template (Phase 0) before Msg91 is enabled.
 */
export interface OtpProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<void>;
}

/** Dev/test provider. Keeps the last code per phone in memory (test hook); never used in production. */
export class MockOtpProvider implements OtpProvider {
  readonly name = 'mock';
  private readonly outbox = new Map<string, string>();

  constructor(private readonly opts: { echoToConsole?: boolean } = {}) {}

  async send(phone: string, code: string): Promise<void> {
    this.outbox.set(phone, code);
    // Development convenience only — env validation forbids the mock provider in production.
    if (this.opts.echoToConsole) process.stdout.write(`\n[DEV OTP] ${phone.slice(-4)} → ${code}\n\n`);
  }

  /** Test hook: the last code sent to `phone`. */
  lastCodeFor(phone: string): string | undefined {
    return this.outbox.get(phone);
  }
}

/** MSG91 (TRAI DLT). Wired once Phase 0 delivers the DLT template + auth key. */
export class Msg91OtpProvider implements OtpProvider {
  readonly name = 'msg91';

  constructor(private readonly config: { authKey: string; templateId: string }) {}

  async send(): Promise<void> {
    void this.config;
    throw new Error('Msg91OtpProvider is not enabled yet — pending TRAI DLT template approval (Phase 0)');
  }
}
