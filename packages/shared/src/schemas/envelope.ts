import { z } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../errors';

const errorCodeValues = Object.keys(ERROR_CODES) as [ErrorCode, ...ErrorCode[]];

export const ApiErrorSchema = z.object({
  code: z.enum(errorCodeValues),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Standard response envelope (Rules §2.2). */
export const EnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data,
      error: z.null(),
      requestId: z.string(),
      timestamp: z.iso.datetime(),
    }),
    z.object({
      success: z.literal(false),
      data: z.null(),
      error: ApiErrorSchema,
      requestId: z.string(),
      timestamp: z.iso.datetime(),
    }),
  ]);

export type Envelope<T> =
  | { success: true; data: T; error: null; requestId: string; timestamp: string }
  | { success: false; data: null; error: ApiError; requestId: string; timestamp: string };
