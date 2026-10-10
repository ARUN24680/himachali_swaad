import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvelopeSchema, PaiseSchema, PhoneSchema, PincodeSchema, RoleEnum, isErrorCode } from '../src';

describe('base schemas', () => {
  it('accepts only E.164 Indian mobiles', () => {
    expect(PhoneSchema.safeParse('+919876543210').success).toBe(true);
    for (const bad of ['9876543210', '+915876543210', '+91987654321', '+9198765432100']) {
      expect(PhoneSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts only 6-digit pincodes not starting with 0', () => {
    expect(PincodeSchema.safeParse('600042').success).toBe(true);
    expect(PincodeSchema.safeParse('060042').success).toBe(false);
    expect(PincodeSchema.safeParse('60004').success).toBe(false);
  });

  it('accepts only non-negative integer paise', () => {
    expect(PaiseSchema.safeParse(39900).success).toBe(true);
    expect(PaiseSchema.safeParse(-1).success).toBe(false);
    expect(PaiseSchema.safeParse(399.5).success).toBe(false);
  });

  it('mirrors the user_role enum', () => {
    expect(RoleEnum.options).toEqual(['CUSTOMER', 'ADMIN', 'KITCHEN_PARTNER']);
  });
});

describe('EnvelopeSchema', () => {
  const schema = EnvelopeSchema(z.object({ ok: z.boolean() }));
  const base = { requestId: 'req_1', timestamp: '2026-10-11T10:00:00.000Z' };

  it('parses success and error envelopes', () => {
    expect(schema.safeParse({ ...base, success: true, data: { ok: true }, error: null }).success).toBe(true);
    expect(
      schema.safeParse({ ...base, success: false, data: null, error: { code: 'NOT_FOUND', message: 'x' } }).success,
    ).toBe(true);
  });

  it('rejects unknown error codes', () => {
    expect(
      schema.safeParse({ ...base, success: false, data: null, error: { code: 'NOPE', message: 'x' } }).success,
    ).toBe(false);
    expect(isErrorCode('OUT_OF_STOCK')).toBe(true);
    expect(isErrorCode('NOPE')).toBe(false);
  });
});
