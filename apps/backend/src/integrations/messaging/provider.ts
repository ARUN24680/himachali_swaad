import type { MessageLanguage } from '@pk/shared';

/**
 * Template message providers (Phase 8 §8.4, D-38). WhatsApp primary, SMS fallback; thin clients —
 * no DB, no business rules. `to` is E.164 (+91…).
 */
export type MessageChannel = 'WHATSAPP' | 'SMS';

export interface SendTemplateInput {
  to: string;
  template: string;
  language: MessageLanguage;
  /** Named variables in the registry's order (templates.ts) — providers map them positionally. */
  variables: Record<string, string>;
  variableOrder: readonly string[];
}

export interface MessageProvider {
  readonly channel: MessageChannel;
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<{ providerMessageId: string }>;
}

/**
 * `retryable` = network / 5xx / 429 / provider throttling → BullMQ retries. Otherwise permanent:
 * `NOT_ON_CHANNEL` (number not on WhatsApp, DND for SMS), `REJECTED` (template / param problems).
 */
export class MessageError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly reason: 'NOT_ON_CHANNEL' | 'REJECTED' | 'TRANSIENT' = retryable ? 'TRANSIENT' : 'REJECTED',
  ) {
    super(message);
    this.name = 'MessageError';
  }
}

/** Admin e-mail fallback (Phase 8 §8.6). Only a log-backed driver until an email provider is chosen. */
export interface EmailSender {
  readonly name: string;
  send(input: { to: string; subject: string; text: string }): Promise<void>;
}

/** +919812345678 → 919812345678 (WhatsApp / MSG91 want digits only). */
export const digitsOnly = (e164: string) => e164.replace(/^\+/, '');
