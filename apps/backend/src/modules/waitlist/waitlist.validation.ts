import { WAITLIST_SOURCES } from '@pk/shared';
import { z } from 'zod';

/** Row schema — every query result is parsed (D-07). */
export const WaitlistEntryRowSchema = z.object({
  id: z.uuid(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  source: z.enum(WAITLIST_SOURCES),
  consent_at: z.date(),
  created_at: z.date(),
});
export type WaitlistEntryRow = z.infer<typeof WaitlistEntryRowSchema>;

export const WaitlistListRowSchema = WaitlistEntryRowSchema.extend({ total: z.number().int() });
export type WaitlistListRow = z.infer<typeof WaitlistListRowSchema>;
