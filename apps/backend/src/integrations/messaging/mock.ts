import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { maskPhone, renderTemplate, isTemplateName } from '@pk/shared';
import { MessageError, type EmailSender, type MessageChannel, type MessageProvider } from './provider';

export interface MockMessage {
  id: string;
  channel: MessageChannel;
  to: string;
  template: string;
  language: string;
  variables: Record<string, string>;
  text: string;
  at: string;
}

const OUTBOX_MAX = 200;

/**
 * Dev / CI stand-in (WHATSAPP_PROVIDER / SMS_PROVIDER = mock, refused in production): renders the
 * template, keeps it in a Redis outbox shared by the API and the worker (dev page + tests read it),
 * never sends anything. Failure rules for testing fallbacks:
 *  - WhatsApp to a number ending 0000 → not on WhatsApp (permanent)
 *  - `failNext(n, retryable)` → the next n sends fail
 */
export function createMockMessageProvider(cfg: { channel: MessageChannel; redis: Redis; logger: Logger }) {
  const key = `pk:mock-messages:${cfg.channel}`;
  const failures: boolean[] = [];
  const provider: MessageProvider & {
    outbox(): Promise<MockMessage[]>;
    failNext(n: number, retryable: boolean): void;
    clear(): Promise<void>;
  } = {
    channel: cfg.channel,
    name: `mock-${cfg.channel.toLowerCase()}`,
    async sendTemplate(input) {
      const fail = failures.shift();
      if (fail !== undefined) throw new MessageError(`mock ${cfg.channel} failure`, fail);
      if (cfg.channel === 'WHATSAPP' && input.to.endsWith('0000')) {
        throw new MessageError('mock: recipient is not on WhatsApp', false, 'NOT_ON_CHANNEL');
      }
      const id = `${cfg.channel === 'WHATSAPP' ? 'wamid.MOCK' : 'sms.MOCK'}${randomBytes(8).toString('hex')}`;
      const text = isTemplateName(input.template)
        ? renderTemplate(input.template, input.language, input.variables)
        : JSON.stringify(input.variables);
      const msg: MockMessage = {
        id,
        channel: cfg.channel,
        to: input.to,
        template: input.template,
        language: input.language,
        variables: input.variables,
        text,
        at: new Date().toISOString(),
      };
      await cfg.redis
        .multi()
        .lpush(key, JSON.stringify(msg))
        .ltrim(key, 0, OUTBOX_MAX - 1)
        .exec();
      cfg.logger.info({ channel: cfg.channel, to: maskPhone(input.to), template: input.template, id }, 'mock message');
      return { providerMessageId: id };
    },
    async outbox() {
      return (await cfg.redis.lrange(key, 0, -1)).map((s) => JSON.parse(s) as MockMessage);
    },
    failNext(n, retryable) {
      for (let i = 0; i < n; i++) failures.push(retryable);
    },
    async clear() {
      await cfg.redis.del(key);
    },
  };
  return provider;
}
export type MockMessageProvider = ReturnType<typeof createMockMessageProvider>;

/** Admin e-mail "sender" that only logs (no provider chosen yet — pending-requirements). */
export function createLogEmailSender(logger: Logger): EmailSender & { sent: { to: string; subject: string }[] } {
  const sent: { to: string; subject: string }[] = [];
  return {
    name: 'log',
    sent,
    async send({ to, subject }) {
      sent.push({ to, subject });
      logger.info({ to: to.replace(/^[^@]+/, '***'), subject }, 'admin email (log driver)');
    },
  };
}
