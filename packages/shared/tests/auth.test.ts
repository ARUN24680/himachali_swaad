import { describe, expect, it } from 'vitest';
import { CAPABILITIES, can, maskPhone, StaffLoginRequestSchema, NewPasswordSchema } from '../src';

describe('access matrix (Phase 2 §2.1)', () => {
  it('matches the documented role table', () => {
    expect(can('CUSTOMER', 'orders:own')).toBe(true);
    expect(can('KITCHEN_PARTNER', 'orders:own')).toBe(false);
    expect(can('KITCHEN_PARTNER', 'packing:operate')).toBe(true);
    expect(can('KITCHEN_PARTNER', 'settlements:read')).toBe(true); // D-40
    expect(can('KITCHEN_PARTNER', 'settlements:manage')).toBe(false);
    expect(can('KITCHEN_PARTNER', 'settings:manage')).toBe(false);
    expect(can('KITCHEN_PARTNER', 'dashboard:revenue')).toBe(false);
    expect(can('KITCHEN_PARTNER', 'customers:read')).toBe(false);
    expect(can('CUSTOMER', 'catalog:manage')).toBe(false);
  });

  it('gives ADMIN every capability', () => {
    for (const cap of Object.keys(CAPABILITIES) as (keyof typeof CAPABILITIES)[]) {
      expect(can('ADMIN', cap), cap).toBe(true);
    }
  });
});

describe('auth contracts', () => {
  it('masks phone numbers', () => {
    expect(maskPhone('+919876543210')).toBe('+91******3210');
    expect(maskPhone(null)).toBeNull();
  });

  it('validates staff login and new passwords', () => {
    expect(StaffLoginRequestSchema.safeParse({ email: 'a@pahadikhatki.in', password: 'x' }).success).toBe(true);
    expect(StaffLoginRequestSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(StaffLoginRequestSchema.safeParse({ email: 'a@b.in', password: 'x', totp: '12345' }).success).toBe(false);
    expect(NewPasswordSchema.safeParse('short').success).toBe(false);
    expect(NewPasswordSchema.safeParse('long-enough-passphrase').success).toBe(true);
  });
});
