import { z } from 'zod';
import { ORDER_CODE_REGEX } from '../order/order-code';
import { PhoneSchema } from '../schemas/common';
import { TimelineEntrySchema } from './tracking';

/**
 * Admin operations console (Phase 9, architecture/02 §7, architecture/04). ADMIN only unless noted.
 * Money in integer paise; dates 'YYYY-MM-DD' are IST calendar days; timestamps ISO.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);
/** `?status=A,B` → ['A', 'B'] (order status names). */
const statusList = z
  .string()
  .optional()
  .transform((v) =>
    v
      ? v
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
  )
  .pipe(z.array(z.string().regex(/^[A-Z_]+$/)));

// ── Dashboard (§9.2) ──────────────────────────────────────────────────────────────────────────────
export const AdminDashboardResponseSchema = z.object({
  awaitingPacking: z.number().int(),
  needsAttention: z.number().int(), // ops_issue set or DELIVERY_FAILED (NDR)
  ndr: z.number().int(),
  inTransit: z.number().int(),
  revenueToday: z.object({ grossPaise: z.number().int(), exGstPaise: z.number().int(), orders: z.number().int() }),
  revenueMonth: z.object({ grossPaise: z.number().int(), exGstPaise: z.number().int(), orders: z.number().int() }),
  sellableJars: z.number().int(),
  batchesExpiringIn30Days: z.number().int(),
  ordersPerDay: z.array(z.object({ date: isoDate, orders: z.number().int(), grossPaise: z.number().int() })),
  revenueByProduct: z.array(z.object({ title: z.string(), jars: z.number().int(), grossPaise: z.number().int() })),
  generatedAt: z.iso.datetime(),
});
export type AdminDashboardResponse = z.infer<typeof AdminDashboardResponseSchema>;

// ── Ops metrics (Phase 10 §10.3) ──────────────────────────────────────────────────────────────────
export const AdminOpsMetricsResponseSchema = z.object({
  /** Last 24 IST hours, oldest first; `hour` = "YYYY-MM-DDTHH:00" (IST). Counted on confirmed_at. */
  ordersByHour: z.array(z.object({ hour: z.string(), orders: z.number().int() })),
  refunds30d: z.object({ count: z.number().int(), processedPaise: z.number().int() }),
  shipped30d: z.number().int(),
  ndrRatePercent30d: z.number(),
  rtoRatePercent30d: z.number(),
});
export type AdminOpsMetricsResponse = z.infer<typeof AdminOpsMetricsResponseSchema>;

export const AdminTestAlertResponseSchema = z.object({ ok: z.literal(true), message: z.string() });
export type AdminTestAlertResponse = z.infer<typeof AdminTestAlertResponseSchema>;

// ── Orders (§9.3) ─────────────────────────────────────────────────────────────────────────────────
export const ADMIN_ORDER_TABS = [
  'all',
  'attention',
  'awaiting_packing',
  'in_transit',
  'ndr',
  'rto',
  'delivered',
  'cancelled',
] as const;
export type AdminOrderTab = (typeof ADMIN_ORDER_TABS)[number];

export const AdminOrdersQuerySchema = z.object({
  tab: z.enum(ADMIN_ORDER_TABS).default('all'),
  status: statusList,
  /** Order code, phone (10-digit or +91…) or AWB. */
  q: z.string().trim().max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  page,
  pageSize,
  sort: z.enum(['created_desc', 'created_asc', 'total_desc', 'total_asc']).default('created_desc'),
});
export type AdminOrdersQuery = z.input<typeof AdminOrdersQuerySchema>;

export const AdminOrderRowSchema = z.object({
  orderCode: z.string(),
  createdAt: z.iso.datetime(),
  customerName: z.string(),
  city: z.string(),
  state: z.string(),
  itemsSummary: z.string(), // "1× Chicken 250g, 2× Mutton 500g"
  totalPaise: z.number().int(),
  paymentStatus: z.string(),
  status: z.string(),
  courierName: z.string().nullable(),
  awbCode: z.string().nullable(),
  opsIssue: z.boolean(),
});
export type AdminOrderRow = z.infer<typeof AdminOrderRowSchema>;

export const AdminOrdersResponseSchema = z.object({
  orders: z.array(AdminOrderRowSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  /** Badge counts for every tab (ignoring the tab filter, honouring q/from/to). */
  counts: z.record(z.enum(ADMIN_ORDER_TABS), z.number().int()),
});
export type AdminOrdersResponse = z.infer<typeof AdminOrdersResponseSchema>;

export const AdminOrderDetailSchema = z.object({
  order: z.object({
    orderCode: z.string(),
    status: z.string(),
    paymentStatus: z.string(),
    createdAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime().nullable(),
    packedAt: z.iso.datetime().nullable(),
    shippedAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    cancelledAt: z.iso.datetime().nullable(),
    cancelReason: z.string().nullable(),
    opsIssue: z.string().nullable(),
    subtotalPaise: z.number().int(),
    shippingFeePaise: z.number().int(),
    discountPaise: z.number().int(),
    totalPaise: z.number().int(),
    taxPaise: z.number().int(),
    invoiceNumber: z.string().nullable(),
    invoiceAvailable: z.boolean(),
    whatsappOptIn: z.boolean(),
  }),
  customer: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    userId: z.uuid().nullable(),
  }),
  shippingAddress: z.object({
    fullName: z.string(),
    phone: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
    landmark: z.string().nullable(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
  }),
  kitchen: z.object({ code: z.string(), name: z.string() }),
  items: z.array(
    z.object({
      title: z.string(),
      sku: z.string(),
      quantity: z.number().int(),
      unitPricePaise: z.number().int(),
      totalPricePaise: z.number().int(),
      allocations: z.array(
        z.object({
          batchCode: z.string(),
          quantity: z.number().int(),
          manufacturedAt: isoDate,
          expiryDate: isoDate,
          status: z.string(),
        }),
      ),
    }),
  ),
  timeline: z.array(TimelineEntrySchema),
  statusLog: z.array(
    z.object({
      from: z.string().nullable(),
      to: z.string(),
      actor: z.string(),
      reason: z.string().nullable(),
      at: z.iso.datetime(),
    }),
  ),
  payments: z.array(
    z.object({
      id: z.uuid(),
      gatewayPaymentId: z.string().nullable(),
      amountPaise: z.number().int(),
      method: z.string().nullable(),
      status: z.string(),
      feePaise: z.number().int().nullable(),
      feeTaxPaise: z.number().int().nullable(),
      errorCode: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  refunds: z.array(
    z.object({
      id: z.uuid(),
      amountPaise: z.number().int(),
      reason: z.string(),
      status: z.string(),
      notes: z.string().nullable(),
      createdAt: z.iso.datetime(),
      processedAt: z.iso.datetime().nullable(),
    }),
  ),
  /** Captured − every non-failed refund: the most a new refund may be. */
  refundablePaise: z.number().int(),
  shipment: z
    .object({
      courierName: z.string().nullable(),
      awbCode: z.string().nullable(),
      etd: z.string().nullable(),
      deadWeightG: z.number().int().nullable(),
      chargedWeightG: z.number().int().nullable(),
      freightPaise: z.number().int().nullable(),
      rtoFreightPaise: z.number().int().nullable(),
      pickupScheduledFor: z.string().nullable(),
      labelAvailable: z.boolean(),
      lastStatus: z.string().nullable(),
      lastError: z.string().nullable(),
      bookingAttempts: z.number().int(),
      trackingEvents: z.array(
        z.object({ statusText: z.string(), location: z.string().nullable(), at: z.iso.datetime(), source: z.string() }),
      ),
    })
    .nullable(),
  notifications: z.array(
    z.object({
      channel: z.string(),
      template: z.string(),
      status: z.string(),
      recipient: z.string(), // masked
      error: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  notes: z.array(z.object({ text: z.string(), by: z.string().nullable(), at: z.iso.datetime() })),
  actions: z.object({
    canCancel: z.boolean(),
    canRefund: z.boolean(),
    canRetryShipment: z.boolean(),
    canResolveIssue: z.boolean(),
  }),
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;

export const ADMIN_REFUND_REASONS = ['CUSTOMER_CANCEL', 'DAMAGED', 'RTO', 'LOST', 'GOODWILL'] as const;
export const AdminRefundRequestSchema = z.object({
  amountPaise: z.number().int().positive(),
  reason: z.enum(ADMIN_REFUND_REASONS),
  notes: z.string().trim().min(3).max(300),
});
export type AdminRefundRequest = z.infer<typeof AdminRefundRequestSchema>;
export const IdempotencyHeadersSchema = z.object({ 'idempotency-key': z.uuid() });

export const RESENDABLE_TEMPLATES = [
  'order_confirmed',
  'order_shipped',
  'out_for_delivery',
  'delivered_storage_tip',
  'delivery_attempt_failed',
  'order_cancelled',
  'refund_processed',
] as const;
export const ResendNotificationRequestSchema = z.object({ template: z.enum(RESENDABLE_TEMPLATES) });
export const ResolveIssueRequestSchema = z.object({ note: z.string().trim().min(3).max(500) });
export const AddNoteRequestSchema = z.object({ text: z.string().trim().min(1).max(1000) });
export const AdminActionResponseSchema = z.object({ ok: z.literal(true), message: z.string() });

// ── Customers (§9.5) ──────────────────────────────────────────────────────────────────────────────
export const AdminCustomersQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  page,
  pageSize,
  sort: z.enum(['last_order_desc', 'ltv_desc', 'orders_desc']).default('last_order_desc'),
});
export const AdminCustomerRowSchema = z.object({
  phone: z.string(),
  userId: z.uuid().nullable(),
  name: z.string(),
  ordersCount: z.number().int(),
  lifetimeValuePaise: z.number().int(),
  lastOrderAt: z.iso.datetime(),
  rtoCount: z.number().int(),
  /** ≥ 1 RTO — think before shipping COD (v2) / call before dispatch. */
  risk: z.boolean(),
});
export type AdminCustomerRow = z.infer<typeof AdminCustomerRowSchema>;
export const AdminCustomersResponseSchema = z.object({
  customers: z.array(AdminCustomerRowSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const CustomerPhoneParamsSchema = z.object({ phone: PhoneSchema });
export const AdminCustomerDetailSchema = z.object({
  customer: AdminCustomerRowSchema.extend({ email: z.string().nullable() }),
  orders: z.array(AdminOrderRowSchema),
  addresses: z.array(
    z.object({
      id: z.uuid(),
      line1: z.string(),
      city: z.string(),
      state: z.string(),
      pincode: z.string(),
      isDefault: z.boolean(),
    }),
  ),
});
export type AdminCustomerDetail = z.infer<typeof AdminCustomerDetailSchema>;

// ── Inventory extras (§9.6) ───────────────────────────────────────────────────────────────────────
export const ExpiryAlertsResponseSchema = z.object({
  batches: z.array(
    z.object({
      batchId: z.uuid(),
      batchCode: z.string(),
      productTitle: z.string(),
      kitchenCode: z.string(),
      availableStock: z.number().int(),
      expiryDate: isoDate,
      /** Last IST day this batch may still be sold (D-24 buffer). */
      sellableUntil: isoDate,
      daysLeft: z.number().int(),
    }),
  ),
});
export type ExpiryAlertsResponse = z.infer<typeof ExpiryAlertsResponseSchema>;

// ── Staff (§9.7) ──────────────────────────────────────────────────────────────────────────────────
export const StaffRowSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(['ADMIN', 'KITCHEN_PARTNER']),
  isActive: z.boolean(),
  pickupLocationIds: z.array(z.uuid()),
  totpEnabled: z.boolean(),
  lastLoginAt: z.iso.datetime().nullable(),
});
export type StaffRow = z.infer<typeof StaffRowSchema>;
export const StaffListResponseSchema = z.object({ staff: z.array(StaffRowSchema) });
export const StaffCreateRequestSchema = z.object({
  email: z.email().max(160),
  fullName: z.string().trim().min(2).max(120),
  phone: PhoneSchema.optional(),
  role: z.enum(['ADMIN', 'KITCHEN_PARTNER']),
  /** Temporary password the person changes after first login (bcrypt cost 12). */
  password: z.string().min(12).max(128),
  pickupLocationIds: z.array(z.uuid()).max(20).default([]),
});
export type StaffCreateRequest = z.input<typeof StaffCreateRequestSchema>;
export const StaffUpdateRequestSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: PhoneSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    pickupLocationIds: z.array(z.uuid()).max(20).optional(),
    /** Revoke every refresh-token family → signed out everywhere within 15 min (access TTL). */
    forceLogout: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type StaffUpdateRequest = z.infer<typeof StaffUpdateRequestSchema>;

// ── Expenses (§9.8) ───────────────────────────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  'ADS',
  'PACKAGING',
  'RAW_MATERIAL',
  'LOGISTICS',
  'SOFTWARE',
  'COMPLIANCE',
  'OTHER',
] as const;
export const ExpensesQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  page,
  pageSize,
});
export const ExpenseRowSchema = z.object({
  id: z.uuid(),
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: z.number().int(),
  incurredOn: isoDate,
  description: z.string(),
  paidBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  receiptAvailable: z.boolean(),
  settlementId: z.uuid().nullable(),
  /** In a FINALIZED / PAID settlement → read-only. */
  locked: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type ExpenseRow = z.infer<typeof ExpenseRowSchema>;
export const ExpensesResponseSchema = z.object({
  expenses: z.array(ExpenseRowSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPaise: z.number().int(),
});
export const ExpenseCreateRequestSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountPaise: z.number().int().positive().max(1_00_00_000_00),
  incurredOn: isoDate,
  description: z.string().trim().min(3).max(500),
  /** Staff user who paid out of pocket (reimbursed in the settlement), or null = business account. */
  paidById: z.uuid().nullable().default(null),
});
export type ExpenseCreateRequest = z.input<typeof ExpenseCreateRequestSchema>;
export const ExpenseUpdateRequestSchema = ExpenseCreateRequestSchema.partial().extend({
  /** Key returned by the receipt upload call. */
  receiptKey: z
    .string()
    .regex(/^receipts\/[\w-]+\/[\w-]+\.(pdf|jpg|jpeg|png|webp)$/)
    .optional(),
});
export const ReceiptUploadRequestSchema = z.object({
  contentType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export const ReceiptUploadResponseSchema = z.object({
  key: z.string(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
});

// ── Settlements (§9.9, D-40, D-41) ────────────────────────────────────────────────────────────────
export const SETTLEMENT_STATUSES = ['DRAFT', 'FINALIZED', 'PAID'] as const;
export const SettlementGenerateRequestSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    /** Defaults to settings.partner_split_bp (5000 = 50 %). */
    partnerSplitBp: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ['periodEnd'], message: 'End must be on or after start' });
export type SettlementGenerateRequest = z.input<typeof SettlementGenerateRequestSchema>;

const totals = {
  ordersCount: z.number().int(),
  jarsCount: z.number().int(),
  revenueExGstPaise: z.number().int(),
  rawCostPaise: z.number().int(),
  packagingCostPaise: z.number().int(),
  freightPaise: z.number().int(),
  gatewayFeePaise: z.number().int(),
  refundsPaise: z.number().int(),
  rtoFreightPaise: z.number().int(),
  sharedExpensesPaise: z.number().int(),
  netProfitPaise: z.number().int(),
  partnerSharePaise: z.number().int(),
  adminSharePaise: z.number().int(),
  expenseReimbursementPaise: z.number().int(),
  partnerPayoutPaise: z.number().int(),
};
export const SettlementSummarySchema = z.object({
  id: z.uuid(),
  periodStart: isoDate,
  periodEnd: isoDate,
  status: z.enum(SETTLEMENT_STATUSES),
  partnerSplitBp: z.number().int(),
  ...totals,
  bankReference: z.string().nullable(),
  finalizedAt: z.iso.datetime().nullable(),
  paidAt: z.iso.datetime().nullable(),
  partnerAcknowledgedAt: z.iso.datetime().nullable(),
  warningsCount: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type SettlementSummary = z.infer<typeof SettlementSummarySchema>;
export const SettlementsResponseSchema = z.object({ settlements: z.array(SettlementSummarySchema) });

export const SETTLEMENT_WARNINGS = ['MISSING_FREIGHT', 'MISSING_GATEWAY_FEE'] as const;
export const SettlementDetailSchema = z.object({
  settlement: SettlementSummarySchema,
  items: z.array(
    z.object({
      orderCode: z.string(),
      status: z.string(),
      closedAt: z.iso.datetime(), // delivered / RTO / cancelled / lost time
      jars: z.number().int(),
      revenueExGstPaise: z.number().int(),
      rawCostPaise: z.number().int(),
      packagingCostPaise: z.number().int(),
      freightPaise: z.number().int(),
      gatewayFeePaise: z.number().int(),
      refundsPaise: z.number().int(),
      rtoFreightPaise: z.number().int(),
      netPaise: z.number().int(),
    }),
  ),
  expenses: z.array(ExpenseRowSchema),
  /** Missing data: DRAFT is allowed, finalize is blocked until these are fixed (Phase 9 §9.9). */
  warnings: z.array(z.object({ orderCode: z.string(), issue: z.enum(SETTLEMENT_WARNINGS) })),
  canFinalize: z.boolean(),
  statementAvailable: z.boolean(),
});
export type SettlementDetail = z.infer<typeof SettlementDetailSchema>;
export const MarkPaidRequestSchema = z.object({
  bankReference: z.string().trim().min(4).max(80),
  paidAt: z.iso.datetime(),
});

// ── Exports (§9.10) ───────────────────────────────────────────────────────────────────────────────
export const EXPORT_TYPES = ['orders', 'gst', 'inventory-ledger', 'customers', 'settlement'] as const;
export const ExportParamsSchema = z.object({ type: z.enum(EXPORT_TYPES) });
export const ExportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  settlementId: z.uuid().optional(),
});

// ── Ops tooling (§9.11) + audit log ───────────────────────────────────────────────────────────────
export const WebhookFailuresResponseSchema = z.object({
  events: z.array(
    z.object({
      id: z.number().int(),
      provider: z.string(),
      eventType: z.string(),
      receivedAt: z.iso.datetime(),
      attempts: z.number().int(),
      lastError: z.string().nullable(),
      processed: z.boolean(),
    }),
  ),
});
export const WebhookIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export const AuditLogQuerySchema = z.object({
  action: z.string().max(60).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(100).optional(),
  page,
  pageSize,
});
export const AuditLogResponseSchema = z.object({
  entries: z.array(
    z.object({
      id: z.number().int(),
      action: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      actor: z.object({ id: z.uuid(), email: z.string().nullable() }).nullable(),
      before: z.unknown().nullable(),
      after: z.unknown().nullable(),
      ip: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const OrderCodeOnlySchema = z.object({ orderCode: z.string().regex(ORDER_CODE_REGEX) });
