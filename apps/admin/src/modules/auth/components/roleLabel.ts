import type { Role } from '@pk/shared';

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  KITCHEN_PARTNER: 'Kitchen partner',
  CUSTOMER: 'Customer',
};

/** "Asha Negi" → "AN", null → fallback from email */
export function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase();
}
