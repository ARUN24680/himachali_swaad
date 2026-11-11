import type { WaitlistSource } from '@pk/shared';

export const SOURCE_LABEL: Record<WaitlistSource, string> = {
  'coming-soon': 'Coming soon',
  storefront: 'Storefront',
};

/** Badge tone per source — both are "good" signals; the teaser gets the informational tint. */
export const SOURCE_TONE: Record<WaitlistSource, 'info' | 'success'> = {
  'coming-soon': 'info',
  storefront: 'success',
};

/** '+919876543210' → '+91 98765 43210' */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
