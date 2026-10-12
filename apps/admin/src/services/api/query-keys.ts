import type {
  AdminCustomersQuerySchema,
  AdminOrdersQuery,
  AuditLogQuerySchema,
  BatchListQuery,
  ExpensesQuerySchema,
  PartnerOrdersQuery,
} from '@pk/shared';
import type { z } from 'zod';

/** Central TanStack Query keys (architecture/09 §3.3). Hierarchical so a prefix invalidates a family. */
export const queryKeys = {
  me: ['auth', 'me'] as const,
  products: {
    all: ['products'] as const,
    list: () => ['products', 'list'] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
  },
  batches: {
    all: ['batches'] as const,
    list: (filters: BatchListQuery) => ['batches', 'list', filters] as const,
    movements: (batchId: string) => ['batches', 'movements', batchId] as const,
    productOptions: ['batches', 'product-options'] as const,
    /** Phase 9 §9.6 — ADMIN: batches whose sellable window ends within 14 days. */
    expiryAlerts: ['batches', 'expiry-alerts'] as const,
  },
  pickupLocations: ['partner', 'pickup-locations'] as const,
  /** Packing desk (Phase 7). `partner.orders.all` invalidates every status tab. */
  partner: {
    orders: {
      all: ['partner', 'orders'] as const,
      list: (status: NonNullable<PartnerOrdersQuery['status']>) => ['partner', 'orders', status] as const,
    },
    manifests: ['partner', 'manifests'] as const,
    push: ['partner', 'push-subscriptions'] as const,
    /** Phase 9 §9.9 — partner's finalized / paid statements (D-40). */
    settlements: {
      all: ['partner', 'settlements'] as const,
      detail: (id: string) => ['partner', 'settlements', id] as const,
    },
  },
  // ── Phase 9 admin console ───────────────────────────────────────────────
  dashboard: ['admin', 'dashboard'] as const,
  orders: {
    all: ['admin', 'orders'] as const,
    list: (q: AdminOrdersQuery) => ['admin', 'orders', 'list', q] as const,
    detail: (code: string) => ['admin', 'orders', 'detail', code] as const,
  },
  customers: {
    all: ['admin', 'customers'] as const,
    list: (q: z.input<typeof AdminCustomersQuerySchema>) => ['admin', 'customers', 'list', q] as const,
    detail: (phone: string) => ['admin', 'customers', 'detail', phone] as const,
  },
  settings: ['admin', 'settings'] as const,
  staff: ['admin', 'staff'] as const,
  expenses: {
    all: ['admin', 'expenses'] as const,
    list: (q: z.input<typeof ExpensesQuerySchema>) => ['admin', 'expenses', 'list', q] as const,
  },
  settlements: {
    all: ['admin', 'settlements'] as const,
    list: ['admin', 'settlements', 'list'] as const,
    detail: (id: string) => ['admin', 'settlements', 'detail', id] as const,
  },
  webhookFailures: ['admin', 'webhooks', 'failures'] as const,
  auditLog: (q: z.input<typeof AuditLogQuerySchema>) => ['admin', 'audit-log', q] as const,
};
