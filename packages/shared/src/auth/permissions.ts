import type { Role } from './roles';

/**
 * Access matrix (Phase 2 §2.1, D-17, D-40) — the ONLY place capabilities are mapped to roles.
 * Backend guards and frontend UI gating both read this. KITCHEN_PARTNER capabilities are
 * additionally scoped to the partner's own pickup locations (user_pickup_locations).
 */
export const CAPABILITIES = {
  'orders:own': ['CUSTOMER', 'ADMIN'],
  'orders:all': ['ADMIN'],
  'packing:operate': ['KITCHEN_PARTNER', 'ADMIN'],
  'batches:manage': ['KITCHEN_PARTNER', 'ADMIN'],
  'catalog:manage': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'orders:cancel-refund': ['ADMIN'],
  'settlements:read': ['KITCHEN_PARTNER', 'ADMIN'],
  'settlements:manage': ['ADMIN'],
  'dashboard:revenue': ['ADMIN'],
  'customers:read': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

/** Capabilities a KITCHEN_PARTNER holds only for their own pickup locations. */
export const LOCATION_SCOPED: ReadonlySet<Capability> = new Set(['packing:operate', 'batches:manage']);

export const STAFF_ROLES = ['ADMIN', 'KITCHEN_PARTNER'] as const satisfies readonly Role[];

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

export const rolesFor = (capability: Capability): readonly Role[] => CAPABILITIES[capability];
