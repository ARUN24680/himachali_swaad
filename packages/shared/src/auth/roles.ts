import { z } from 'zod';

/** D-17 — mirrors the `user_role` Postgres enum. */
export const ROLES = ['CUSTOMER', 'ADMIN', 'KITCHEN_PARTNER'] as const;
export const RoleEnum = z.enum(ROLES);
export type Role = z.infer<typeof RoleEnum>;
