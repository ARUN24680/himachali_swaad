/**
 * Message template registry (Phase 8 §8.5, architecture/07 §6) — zod-free (`@pk/shared/notifications`).
 * Names must match the templates approved with Meta / the DLT operator (Phase 0). Variables are
 * named and sent in `variables` order as the template's positional parameters.
 *
 * - `critical`: an order fact the customer must get → SMS fallback when WhatsApp fails or the
 *   customer didn't opt in to WhatsApp (DPDP, Rules §4.4).
 * - `quietHours`: not urgent → held 21:00–08:00 IST and sent at 08:00.
 */
export type Audience = 'CUSTOMER' | 'PARTNER' | 'ADMIN';
export type MessageLanguage = 'en' | 'hi';

export interface TemplateSpec {
  audience: Audience;
  critical: boolean;
  quietHours: boolean;
  variables: readonly string[];
  /** Plain-text rendering (mock provider, SMS body, admin email) — `{{name}}` placeholders. */
  text: Record<MessageLanguage, string>;
}

export const TEMPLATES = {
  order_confirmed: {
    audience: 'CUSTOMER',
    critical: true,
    quietHours: false,
    variables: ['customer_name', 'order_code', 'items', 'track_url'],
    text: {
      en: 'Hi {{customer_name}}, your order {{order_code}} is confirmed: {{items}}. Track: {{track_url}} — Pahadi Khatki',
      hi: 'Namaste {{customer_name}}, aapka order {{order_code}} confirm ho gaya: {{items}}. Track: {{track_url}} — Pahadi Khatki',
    },
  },
  order_shipped: {
    audience: 'CUSTOMER',
    critical: false,
    quietHours: false,
    variables: ['order_code', 'courier', 'awb', 'etd', 'track_url'],
    text: {
      en: 'Your order {{order_code}} is on its way with {{courier}} (AWB {{awb}}), expected by {{etd}}. Track: {{track_url}}',
      hi: 'Aapka order {{order_code}} {{courier}} se nikal gaya hai (AWB {{awb}}), {{etd}} tak pahunchega. Track: {{track_url}}',
    },
  },
  out_for_delivery: {
    audience: 'CUSTOMER',
    critical: true,
    quietHours: false,
    variables: ['order_code', 'track_url'],
    text: {
      en: 'Your Pahadi Khatki order {{order_code}} is out for delivery today. Track: {{track_url}}',
      hi: 'Aapka Pahadi Khatki order {{order_code}} aaj delivery ke liye nikal chuka hai. Track: {{track_url}}',
    },
  },
  delivered_storage_tip: {
    audience: 'CUSTOMER',
    critical: false,
    quietHours: false,
    variables: ['order_code'],
    text: {
      en: 'Order {{order_code}} delivered! Keep the jar in a cool, dry place and always use a dry spoon 🏔️',
      hi: 'Order {{order_code}} deliver ho gaya! Thandi jagah rakhein, hamesha sookha chammach use karein 🏔️',
    },
  },
  delivery_attempt_failed: {
    audience: 'CUSTOMER',
    critical: true,
    quietHours: false,
    variables: ['order_code', 'help_url'],
    text: {
      en: 'The courier could not deliver order {{order_code}}. Reply or chat with us to reattempt: {{help_url}}',
      hi: 'Courier order {{order_code}} deliver nahi kar paya. Dobara delivery ke liye humse baat karein: {{help_url}}',
    },
  },
  order_cancelled: {
    audience: 'CUSTOMER',
    critical: true,
    quietHours: false,
    variables: ['order_code', 'refund_note'],
    text: {
      en: 'Your order {{order_code}} has been cancelled. {{refund_note}}',
      hi: 'Aapka order {{order_code}} cancel ho gaya hai. {{refund_note}}',
    },
  },
  refund_processed: {
    audience: 'CUSTOMER',
    critical: true,
    quietHours: false,
    variables: ['order_code', 'amount'],
    text: {
      en: 'Refund of {{amount}} for order {{order_code}} is processed. It reaches your account in 5–7 working days.',
      hi: 'Order {{order_code}} ka {{amount}} refund process ho gaya. 5–7 working days me account me aa jayega.',
    },
  },
  new_order_alert: {
    audience: 'PARTNER',
    critical: false,
    quietHours: false,
    variables: ['order_code', 'jars'],
    text: {
      en: 'New order {{order_code}} — {{jars}} jar(s) to pack.',
      hi: 'Naya order {{order_code}} — {{jars}} jar pack karne hain.',
    },
  },
  order_cancelled_partner: {
    audience: 'PARTNER',
    critical: false,
    quietHours: false,
    variables: ['order_code'],
    text: {
      en: 'Order {{order_code}} was cancelled — do NOT pack or hand it over.',
      hi: 'Order {{order_code}} cancel ho gaya — pack mat karein, courier ko mat dein.',
    },
  },
  settlement_ready: {
    audience: 'PARTNER',
    critical: false,
    quietHours: true,
    variables: ['period', 'payout'],
    text: {
      en: 'Settlement for {{period}} is ready — your payout {{payout}}. Please review and acknowledge in the desk app.',
      hi: '{{period}} ka hisaab taiyaar hai — aapka payout {{payout}}. Desk app me dekh kar acknowledge karein.',
    },
  },
  packing_digest: {
    audience: 'PARTNER',
    critical: false,
    quietHours: true,
    variables: ['count'],
    text: {
      en: '{{count}} order(s) to pack today.',
      hi: 'Aaj {{count}} order pack karne hain.',
    },
  },
  admin_alert: {
    audience: 'ADMIN',
    critical: false,
    quietHours: false,
    variables: ['kind', 'message'],
    text: {
      en: '[Pahadi Khatki ops] {{kind}}: {{message}}',
      hi: '[Pahadi Khatki ops] {{kind}}: {{message}}',
    },
  },
} as const satisfies Record<string, TemplateSpec>;

export type TemplateName = keyof typeof TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as TemplateName[];

export const isTemplateName = (v: string): v is TemplateName => Object.hasOwn(TEMPLATES, v);

/** `{{name}}` → value; unknown placeholders are left visible so a missing variable is obvious in QA. */
export function renderTemplate(name: TemplateName, language: MessageLanguage, vars: Record<string, string>): string {
  return TEMPLATES[name].text[language].replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

const IST_OFFSET_MS = 5.5 * 3600_000;
export const QUIET_START_HOUR_IST = 21;
export const QUIET_END_HOUR_IST = 8;

/** When a quiet-hours template may go out: `now` if allowed, else the next 08:00 IST. */
export function quietHoursRelease(now: Date): Date | null {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const h = ist.getUTCHours();
  if (h >= QUIET_END_HOUR_IST && h < QUIET_START_HOUR_IST) return null;
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const release = h >= QUIET_START_HOUR_IST ? day + 86_400_000 : day;
  return new Date(release + QUIET_END_HOUR_IST * 3600_000 - IST_OFFSET_MS);
}
