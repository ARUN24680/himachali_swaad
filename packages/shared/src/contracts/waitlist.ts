import { z } from 'zod';

/**
 * Pre-launch waitlist (audit 2026-11-03, R-5): the public `/coming-soon` teaser collects a phone
 * number and/or e-mail so launch traffic is not wasted. Guest, no login (D-18). Consent is explicit
 * (DPDP: launch updates only — never marketing by default). The phone is accepted as 10 digits or
 * +91… and normalised to E.164 like `TrackRequestSchema`.
 */
export const WAITLIST_SOURCES = ['coming-soon', 'storefront'] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (/^[6-9]\d{9}$/.test(v) ? `+91${v}` : /^91[6-9]\d{9}$/.test(v) ? `+${v}` : v))
  .pipe(z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'));

export const WaitlistJoinRequestSchema = z
  .object({
    phone: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), phone.optional()),
    email: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.string().trim().toLowerCase().email('Enter a valid e-mail address').max(254).optional(),
    ),
    /** First name is optional and never required to join. */
    name: z.string().trim().max(80).optional(),
    source: z.enum(WAITLIST_SOURCES).default('coming-soon'),
    /** "Notify me when the store opens" — must be explicitly true. */
    consent: z.literal(true),
  })
  .refine((v) => v.phone !== undefined || v.email !== undefined, {
    path: ['phone'],
    message: 'Enter a mobile number or an e-mail address',
  });
export type WaitlistJoinRequest = z.input<typeof WaitlistJoinRequestSchema>;

export const WaitlistJoinResponseSchema = z.object({
  joined: z.literal(true),
  /** Already on the list (same phone or e-mail) — still a success for the visitor. */
  alreadyJoined: z.boolean(),
});
export type WaitlistJoinResponse = z.infer<typeof WaitlistJoinResponseSchema>;

/** Admin list (ADMIN only) — phone/e-mail are shown in full to staff, never publicly. */
export const AdminWaitlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  /** Matches phone or e-mail (contains). */
  q: z.string().trim().max(100).optional(),
  source: z.enum(WAITLIST_SOURCES).optional(),
});
export type AdminWaitlistQuery = z.input<typeof AdminWaitlistQuerySchema>;

export const WaitlistEntrySchema = z.object({
  id: z.uuid(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  source: z.enum(WAITLIST_SOURCES),
  consentAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type WaitlistEntry = z.infer<typeof WaitlistEntrySchema>;

export const AdminWaitlistResponseSchema = z.object({
  entries: z.array(WaitlistEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AdminWaitlistResponse = z.infer<typeof AdminWaitlistResponseSchema>;
