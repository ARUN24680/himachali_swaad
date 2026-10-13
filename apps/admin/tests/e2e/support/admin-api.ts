import {
  ADMIN_ORDER_TABS,
  AddNoteRequestSchema,
  AdminCancelOrderRequestSchema,
  AdminCustomerDetailSchema,
  AdminCustomersResponseSchema,
  AdminDashboardResponseSchema,
  AdminOrderDetailSchema,
  AdminOrderRowSchema,
  AdminOrdersResponseSchema,
  AdminOpsMetricsResponseSchema,
  AdminTestAlertResponseSchema,
  AdminRefundRequestSchema,
  AuditLogResponseSchema,
  ExpenseCreateRequestSchema,
  ExpenseRowSchema,
  ExpensesResponseSchema,
  ExpenseUpdateRequestSchema,
  ExpiryAlertsResponseSchema,
  KitchenCreateRequestSchema,
  KitchenRowSchema,
  KitchenUpdateRequestSchema,
  MarkPaidRequestSchema,
  ReceiptUploadRequestSchema,
  ResendNotificationRequestSchema,
  ResolveIssueRequestSchema,
  SettingsListResponseSchema,
  SettingUpdateRequestSchema,
  SettlementDetailSchema,
  SettlementGenerateRequestSchema,
  SettlementSummarySchema,
  ChangePasswordRequestSchema,
  StaffCreateRequestSchema,
  StaffResetPasswordRequestSchema,
  StaffRowSchema,
  StaffUpdateRequestSchema,
  WebhookFailuresResponseSchema,
  canTransition,
  todayInIST,
  type AdminOrderDetail,
  type AdminOrderRow,
  type AdminOrderTab,
  type ExpenseRow,
  type KitchenRow,
  type OrderStatus,
  type SettlementDetail,
  type SettlementSummary,
  type StaffRow,
} from '@pk/shared';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { API, mockCatalogApi, ORIGIN, type StaffRole } from './catalog-api';

/**
 * Stateful mock of the Phase 9 admin console API (/admin/*, /partner/settlements*, /orders/:code/invoice)
 * layered over the catalog mock (auth, batches, pickup locations). Every fixture + response is parsed
 * through the @pk/shared contracts, so contract drift fails the spec.
 */
export const FILES = 'https://files.pahadikhatki.test';
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
  'access-control-expose-headers': 'content-disposition',
};
const envelope = (success: boolean, data: unknown, error: unknown = null) => ({
  success,
  data,
  error,
  requestId: 'req_admin',
  timestamp: new Date().toISOString(),
});
const reply = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
const ok = (route: Route, data: unknown, status = 200) => reply(route, status, envelope(true, data));
const fail = (route: Route, status: number, code: string, message: string, details?: Record<string, unknown>) =>
  reply(route, status, envelope(false, null, { code, message, ...(details ? { details } : {}) }));

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const addDays = (iso: string, d: number) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const signed = (name: string) => ({
  url: `${FILES}/${name}?sig=e2e`,
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
});

// ── Orders fixture ────────────────────────────────────────────────────────
const CODE_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const code = (n: number) =>
  `PK-${['7', 'K', 'Q', '2', 'M', '9'].map((c, i) => (i === 5 ? CODE_CHARS[n % 32] : i === 4 ? CODE_CHARS[(n >> 5) % 32] : c)).join('')}`;
const PEOPLE = [
  ['Arun Kumar', 'Chennai', 'Tamil Nadu', '+919876543210'],
  ['Meera Shah', 'Bengaluru', 'Karnataka', '+919812345678'],
  ['Vikram Negi', 'New Delhi', 'Delhi', '+919899001122'],
  ['Rohan Gupta', 'Mumbai', 'Maharashtra', '+919765432109'],
  ['Sneha Nair', 'Kochi', 'Kerala', '+919745001234'],
] as const;
const STATUS_CYCLE: OrderStatus[] = [
  'AWAITING_PACKING',
  'IN_TRANSIT',
  'DELIVERED',
  'DELIVERED',
  'PACKED',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'RTO_IN_TRANSIT',
  'CANCELLED',
];

interface MockOrder {
  row: AdminOrderRow;
  phone: string;
  opsIssueText: string | null;
  refunds: AdminOrderDetail['refunds'];
  notes: AdminOrderDetail['notes'];
  bookingAttempts: number;
  freightPaise: number | null;
  feePaise: number | null;
}

function seedOrders(): MockOrder[] {
  const out: MockOrder[] = [];
  for (let i = 0; i < 32; i++) {
    const [name, city, state, phone] = PEOPLE[i % PEOPLE.length]!;
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length]!;
    const qty = (i % 3) + 1;
    const total = 39900 * qty + (i % 4 === 0 ? 4900 : 0);
    const booked = status !== 'AWAITING_PACKING' && status !== 'CANCELLED';
    const opsIssueText = i === 0 ? 'SHIPMENT_BOOKING_FAILED: Shiprocket wallet balance too low' : null;
    out.push({
      phone,
      opsIssueText,
      refunds: [],
      notes: i === 0 ? [{ text: 'Customer asked for pickup after Diwali.', by: 'Asha Negi', at: hoursAgo(20) }] : [],
      bookingAttempts: i === 0 ? 3 : booked ? 1 : 0,
      freightPaise: status === 'DELIVERED' ? 8500 : null,
      feePaise: status === 'CANCELLED' ? null : Math.round(total * 0.02),
      row: AdminOrderRowSchema.parse({
        orderCode: code(i + 40),
        createdAt: hoursAgo(i * 9 + 2),
        customerName: name,
        city,
        state,
        itemsSummary: `${qty}× Himachali Chicken Pickle 250g${i % 2 ? ', 1× Pahadi Mutton Pickle 250g' : ''}`,
        totalPaise: total,
        paymentStatus: status === 'CANCELLED' ? 'REFUNDED' : 'PAID',
        status,
        courierName: booked ? 'Delhivery' : null,
        awbCode: booked ? `14908${String(1000000 + i)}` : null,
        opsIssue: Boolean(opsIssueText) || status === 'DELIVERY_FAILED',
      }),
    });
  }
  return out;
}

const TAB_MATCH: Record<AdminOrderTab, (o: MockOrder) => boolean> = {
  all: () => true,
  attention: (o) => o.row.opsIssue,
  awaiting_packing: (o) => o.row.status === 'AWAITING_PACKING' || o.row.status === 'CONFIRMED',
  in_transit: (o) => ['PACKED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(o.row.status),
  ndr: (o) => o.row.status === 'DELIVERY_FAILED',
  rto: (o) => o.row.status === 'RTO_IN_TRANSIT' || o.row.status === 'RTO_DELIVERED',
  delivered: (o) => o.row.status === 'DELIVERED',
  cancelled: (o) => o.row.status === 'CANCELLED',
};

const refundedSoFar = (o: MockOrder) =>
  o.refunds.filter((r) => r.status !== 'FAILED').reduce((n, r) => n + r.amountPaise, 0);

function detailOf(o: MockOrder): AdminOrderDetail {
  const r = o.row;
  const today = todayInIST();
  const paid = r.paymentStatus !== 'UNPAID';
  const refundable = paid ? r.totalPaise - refundedSoFar(o) : 0;
  const shipped = Boolean(r.awbCode);
  return AdminOrderDetailSchema.parse({
    order: {
      orderCode: r.orderCode,
      status: r.status,
      paymentStatus: r.paymentStatus,
      createdAt: r.createdAt,
      confirmedAt: r.createdAt,
      packedAt: shipped ? hoursAgo(1) : null,
      shippedAt: shipped ? hoursAgo(1) : null,
      deliveredAt: r.status === 'DELIVERED' ? hoursAgo(1) : null,
      cancelledAt: r.status === 'CANCELLED' ? hoursAgo(1) : null,
      cancelReason: r.status === 'CANCELLED' ? 'Customer changed their mind' : null,
      opsIssue: o.opsIssueText ?? (r.status === 'DELIVERY_FAILED' ? 'NDR: customer not reachable' : null),
      subtotalPaise: r.totalPaise - (r.totalPaise % 39900),
      shippingFeePaise: r.totalPaise % 39900,
      discountPaise: 0,
      totalPaise: r.totalPaise,
      taxPaise: Math.round(r.totalPaise - r.totalPaise / 1.05),
      invoiceNumber: `PK/26-27/${r.orderCode.slice(3)}`,
      invoiceAvailable: true,
      whatsappOptIn: true,
    },
    customer: { name: r.customerName, phone: o.phone, email: 'arun@example.com', userId: null },
    shippingAddress: {
      fullName: r.customerName,
      phone: o.phone,
      line1: '12, Pine View Apartments, 2nd Main Road',
      line2: 'Anna Nagar',
      landmark: 'Opp. Tower Park',
      city: r.city,
      state: r.state,
      pincode: '600040',
    },
    kitchen: { code: 'KULLU-01', name: 'Kullu Kitchen' },
    items: [
      {
        title: 'Himachali Chicken Pickle',
        sku: 'CHK250',
        quantity: 1,
        unitPricePaise: 39900,
        totalPricePaise: 39900,
        allocations: [
          {
            batchCode: 'PK-2610-CHK250-01',
            quantity: 1,
            manufacturedAt: addDays(today, -20),
            expiryDate: addDays(today, 160),
            status: 'COMMITTED',
          },
        ],
      },
    ],
    timeline: [
      { key: 'BOTTLED', label: 'Bottled in Kullu', at: hoursAgo(480), detail: 'PK-2610-CHK250-01', tone: 'neutral' },
      { key: 'CONFIRMED', label: 'Order confirmed', at: r.createdAt, detail: null, tone: 'success' },
      ...(shipped
        ? [{ key: 'HANDED_TO_COURIER', label: 'Handed to courier', at: hoursAgo(1), detail: 'Kullu hub', tone: 'info' }]
        : []),
      ...(r.status === 'DELIVERY_FAILED'
        ? [
            {
              key: 'DELIVERY_FAILED',
              label: 'Delivery attempt failed',
              at: hoursAgo(0.5),
              detail: 'Customer not reachable',
              tone: 'warning',
            },
          ]
        : []),
    ],
    statusLog: [
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', actor: 'RAZORPAY', reason: null, at: r.createdAt },
      { from: 'CONFIRMED', to: 'AWAITING_PACKING', actor: 'SYSTEM', reason: null, at: r.createdAt },
      ...(r.status !== 'AWAITING_PACKING'
        ? [{ from: 'AWAITING_PACKING', to: r.status, actor: 'SYSTEM', reason: null, at: hoursAgo(1) }]
        : []),
    ],
    payments: [
      {
        id: uuid(9000 + Number.parseInt(r.orderCode.slice(-2), 36)),
        gatewayPaymentId: `pay_${r.orderCode.slice(3)}`,
        amountPaise: r.totalPaise,
        method: 'upi',
        status: 'CAPTURED',
        feePaise: o.feePaise,
        feeTaxPaise: o.feePaise == null ? null : Math.round(o.feePaise * 0.18),
        errorCode: null,
        createdAt: r.createdAt,
      },
    ],
    refunds: o.refunds,
    refundablePaise: refundable,
    shipment:
      shipped || o.bookingAttempts
        ? {
            courierName: r.courierName,
            awbCode: r.awbCode,
            etd: '3–4 days',
            deadWeightG: 470,
            chargedWeightG: 500,
            freightPaise: o.freightPaise,
            rtoFreightPaise: null,
            pickupScheduledFor: shipped ? today : null,
            labelAvailable: shipped,
            lastStatus: shipped ? 'In transit' : null,
            lastError: o.opsIssueText ? 'Insufficient wallet balance' : null,
            bookingAttempts: o.bookingAttempts,
            trackingEvents: shipped
              ? [{ statusText: 'Picked up', location: 'Kullu', at: hoursAgo(1), source: 'WEBHOOK' }]
              : [],
          }
        : null,
    notifications: [
      {
        channel: 'WHATSAPP',
        template: 'order_confirmed',
        status: 'DELIVERED',
        recipient: '+91******3210',
        error: null,
        createdAt: r.createdAt,
      },
    ],
    notes: o.notes,
    actions: {
      canCancel: canTransition(r.status as OrderStatus, 'CANCELLED', 'ADMIN'),
      canRefund:
        refundable > 0 && ['DELIVERED', 'RTO_DELIVERED', 'CANCELLED', 'LOST', 'DELIVERY_FAILED'].includes(r.status),
      canRetryShipment: Boolean(o.opsIssueText?.startsWith('SHIPMENT_BOOKING_FAILED')),
      canResolveIssue: r.opsIssue,
    },
  });
}

// ── Settlements fixture ───────────────────────────────────────────────────
interface SettlementItemSeed {
  orderCode: string;
  jars: number;
  revenue: number;
  raw: number;
  freight: number | null;
  fee: number | null;
  refunds: number;
  rto: number;
}

function buildSettlement(
  id: string,
  periodStart: string,
  periodEnd: string,
  status: SettlementSummary['status'],
  seeds: SettlementItemSeed[],
  expenses: ExpenseRow[],
  extra: Partial<SettlementSummary> = {},
  bp = 5000,
): SettlementDetail {
  const PACK = 3200;
  const items = seeds.map((s) => {
    const packaging = s.jars * PACK;
    const freight = s.freight ?? 0;
    const fee = s.fee ?? 0;
    return {
      orderCode: s.orderCode,
      status: s.rto ? 'RTO_DELIVERED' : 'DELIVERED',
      closedAt: `${periodEnd}T10:00:00.000Z`,
      jars: s.jars,
      revenueExGstPaise: s.revenue, // already net of refunds (Phase 9 §9.9)
      rawCostPaise: s.raw,
      packagingCostPaise: packaging,
      freightPaise: freight,
      gatewayFeePaise: fee,
      refundsPaise: s.refunds,
      rtoFreightPaise: s.rto,
      netPaise: s.revenue - s.raw - packaging - freight - fee - s.rto,
    };
  });
  const sum = (k: keyof (typeof items)[number]) => items.reduce((n, i) => n + (i[k] as number), 0);
  const shared = expenses.reduce((n, e) => n + e.amountPaise, 0);
  const net = sum('netPaise') - shared;
  const partnerShare = Math.floor((net * bp) / 10000);
  const reimb = expenses.filter((e) => e.paidBy?.id === uuid(801)).reduce((n, e) => n + e.amountPaise, 0);
  const warnings = seeds.flatMap((s) => [
    ...(s.freight == null ? [{ orderCode: s.orderCode, issue: 'MISSING_FREIGHT' as const }] : []),
    ...(s.fee == null ? [{ orderCode: s.orderCode, issue: 'MISSING_GATEWAY_FEE' as const }] : []),
  ]);
  return SettlementDetailSchema.parse({
    settlement: SettlementSummarySchema.parse({
      id,
      periodStart,
      periodEnd,
      status,
      partnerSplitBp: bp,
      ordersCount: items.length,
      jarsCount: sum('jars'),
      revenueExGstPaise: sum('revenueExGstPaise'),
      rawCostPaise: sum('rawCostPaise'),
      packagingCostPaise: sum('packagingCostPaise'),
      freightPaise: sum('freightPaise'),
      gatewayFeePaise: sum('gatewayFeePaise'),
      refundsPaise: sum('refundsPaise'),
      rtoFreightPaise: sum('rtoFreightPaise'),
      sharedExpensesPaise: shared,
      netProfitPaise: net,
      partnerSharePaise: partnerShare,
      adminSharePaise: net - partnerShare,
      expenseReimbursementPaise: reimb,
      partnerPayoutPaise: sum('rawCostPaise') + partnerShare + reimb,
      bankReference: null,
      finalizedAt: null,
      paidAt: null,
      partnerAcknowledgedAt: null,
      warningsCount: warnings.length,
      createdAt: `${periodEnd}T12:00:00.000Z`,
      ...extra,
    }),
    items,
    expenses,
    warnings,
    canFinalize: status === 'DRAFT' && warnings.length === 0,
    statementAvailable: status !== 'DRAFT',
  });
}

/** The architecture/04 worked example: ₹399 jar → ₹380 ex-GST, raw ₹120, packaging ₹32, freight ₹85, fee ₹9.42. */
const workedExample = (orderCode: string): SettlementItemSeed => ({
  orderCode,
  jars: 1,
  revenue: 38000,
  raw: 12000,
  freight: 8500,
  fee: 942,
  refunds: 0,
  rto: 0,
});

export interface AdminMockOptions {
  role?: StaffRole;
  /** The period's orders are missing freight → generated drafts carry warnings until `resolveMissingData()`. */
  missingData?: boolean;
  emptyOrders?: boolean;
}

/** Full ADMIN console mock: catalog/auth mock + the Phase 9 routes. */
export async function mockAdminApi(page: Page, opts: AdminMockOptions = {}) {
  const catalog = await mockCatalogApi(page, { role: opts.role ?? 'ADMIN' });
  return { catalog, ...(await installAdminRoutes(page, opts, catalog.state.batches)) };
}

/** Phase 9 routes only — registered after another mock, so unknown paths fall back to it. */
export async function installAdminRoutes(
  page: Page | BrowserContext,
  opts: AdminMockOptions = {},
  batches: Awaited<ReturnType<typeof mockCatalogApi>>['state']['batches'] = [],
) {
  const role = opts.role ?? 'ADMIN';
  const today = todayInIST();
  const orders = opts.emptyOrders ? [] : seedOrders();
  const orderRequests: URLSearchParams[] = [];
  const refundCalls: { key: string; body: unknown; status: number }[] = [];
  const bodies: Record<string, unknown[]> = {};
  const record = (k: string, b: unknown) => (bodies[k] ??= []).push(b);
  const acknowledgeCalls: { id: string; status: number }[] = [];
  let missingData = opts.missingData ?? false;
  let nextId = 5000;

  const staff: StaffRow[] = [
    StaffRowSchema.parse({
      id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
      email: 'asha@pahadikhatki.in',
      fullName: 'Asha Negi',
      phone: null,
      role: 'ADMIN',
      isActive: true,
      pickupLocationIds: [],
      totpEnabled: true,
      lastLoginAt: hoursAgo(1),
    }),
    StaffRowSchema.parse({
      id: uuid(801),
      email: 'ramesh@pahadikhatki.in',
      fullName: 'Ramesh Thakur',
      phone: '+919876503210',
      role: 'KITCHEN_PARTNER',
      isActive: true,
      pickupLocationIds: [uuid(500)],
      totpEnabled: false,
      lastLoginAt: hoursAgo(3),
    }),
    StaffRowSchema.parse({
      id: uuid(802),
      email: 'old.helper@pahadikhatki.in',
      fullName: 'Old Helper',
      phone: null,
      role: 'KITCHEN_PARTNER',
      isActive: false,
      pickupLocationIds: [uuid(500)],
      totpEnabled: false,
      lastLoginAt: null,
    }),
  ];

  // Kitchens (pickup locations). KULLU-01 = the catalog mock's kitchen (uuid 500), linked to Shiprocket.
  const kitchens: Omit<KitchenRow, 'partnerCount'>[] = [
    {
      id: uuid(500),
      code: 'KULLU-01',
      name: 'Kullu Kitchen',
      contactName: 'Ramesh Thakur',
      contactPhone: '+919876503210',
      addressLine1: 'Near Dhalpur ground, Akhara Bazar',
      addressLine2: null,
      city: 'Kullu',
      state: 'Himachal Pradesh',
      pincode: '175101',
      shiprocketPickupName: 'Kullu Kitchen',
      fssaiLicenseNo: '12345678901234',
      isActive: true,
    },
  ];
  const kitchenRow = (k: Omit<KitchenRow, 'partnerCount'>): KitchenRow =>
    KitchenRowSchema.parse({
      ...k,
      partnerCount: staff.filter((s) => s.role === 'KITCHEN_PARTNER' && s.pickupLocationIds.includes(k.id)).length,
    });
  /** Wrong-current-password probe for POST /auth/staff/change-password. */
  const CURRENT_PASSWORD = 'mountain-pickle-2026';
  const passwordResets: { id: string; password: string }[] = [];

  const expense = (n: number, p: Partial<ExpenseRow>): ExpenseRow =>
    ExpenseRowSchema.parse({
      id: uuid(600 + n),
      category: 'ADS',
      amountPaise: 250000,
      incurredOn: addDays(today, -n * 4),
      description: 'Instagram ads — Diwali push',
      paidBy: null,
      receiptAvailable: n % 2 === 0,
      settlementId: null,
      locked: false,
      createdAt: hoursAgo(n * 24),
      ...p,
    });
  const expenses: ExpenseRow[] = [
    expense(1, {}),
    expense(2, {
      category: 'PACKAGING',
      amountPaise: 184500,
      description: 'Bubble wrap + kraft boxes (200)',
      paidBy: { id: uuid(801), name: 'Ramesh Thakur' },
    }),
    expense(3, { category: 'SOFTWARE', amountPaise: 99900, description: 'Shiprocket plan' }),
    expense(12, {
      category: 'COMPLIANCE',
      amountPaise: 150000,
      description: 'FSSAI renewal',
      locked: true,
      settlementId: uuid(701),
      incurredOn: addDays(today, -48),
    }),
  ];

  // Seeded history: PAID (acknowledged) + FINALIZED (awaiting ack) + one DRAFT the partner must never see
  const lastMonthStart = addDays(today, -60);
  const settlements = new Map<string, SettlementDetail>();
  const paid = buildSettlement(
    uuid(701),
    lastMonthStart,
    addDays(lastMonthStart, 14),
    'PAID',
    [workedExample('PK-3XZ401'), workedExample('PK-3XZ402')],
    [expenses[3]!],
    {
      finalizedAt: hoursAgo(24 * 40),
      paidAt: hoursAgo(24 * 38),
      bankReference: 'UTR4455667788',
      partnerAcknowledgedAt: hoursAgo(24 * 39),
    },
  );
  const finalized = buildSettlement(
    uuid(702),
    addDays(lastMonthStart, 15),
    addDays(lastMonthStart, 29),
    'FINALIZED',
    [
      workedExample('PK-4PT811'),
      { ...workedExample('PK-4PT812'), jars: 2, revenue: 76000, raw: 24000, freight: 9500, fee: 1884 },
    ],
    [],
    {
      finalizedAt: hoursAgo(24 * 20),
    },
  );
  const draft = buildSettlement(
    uuid(703),
    addDays(lastMonthStart, 30),
    addDays(lastMonthStart, 44),
    'DRAFT',
    [workedExample('PK-5MM812')],
    [],
  );
  for (const s of [paid, finalized, draft]) settlements.set(s.settlement.id, s);

  const settings = SettingsListResponseSchema.parse({
    settings: [
      [
        'free_shipping_threshold_paise',
        null,
        'Cart total (incl. GST) above which shipping is free. Empty until Q-03 is decided.',
      ],
      ['flat_shipping_fee_paise', null, 'Shipping fee below the threshold.'],
      ['reservation_ttl_minutes', 15, 'How long checkout holds jars before releasing them.'],
      ['min_remaining_shelf_days', 45, 'Jars with less shelf life than this are not sold (D-24).'],
      ['transit_buffer_days', 7, 'Added to the shelf-life minimum for courier time.'],
      ['low_stock_threshold', 10, null],
      ['cod_enabled', false, 'Cash on delivery — v2 (D-25).'],
      ['packaging_cost_per_jar_paise', 3200, 'Jar, cap, shrink band, label, box, bubble wrap.'],
      ['pickup_cutoff_hour_ist', 11, 'Orders packed after this hour go with the next pickup.'],
      ['partner_split_bp', 5000, 'Kitchen partner share of the net profit pool.'],
      [
        'seller_details',
        {
          legalName: 'Pahadi Khatki Foods',
          gstin: '02ABCDE1234F1Z5',
          addressLine: 'Village Shamshi, NH-3',
          city: 'Kullu',
          state: 'Himachal Pradesh',
          stateCode: '02',
          pincode: '175126',
        },
        'Printed on tax invoices.',
      ],
      ['razorpay_account_id', 'acc_LIVE123', 'Managed by deploy config.'],
    ].map(([key, value, description], i) => ({
      key,
      value,
      description,
      updatedAt: hoursAgo(i * 30 + 5),
      editable: key !== 'razorpay_account_id',
    })),
  });

  const webhookEvents = WebhookFailuresResponseSchema.parse({
    events: [
      {
        id: 41,
        provider: 'razorpay',
        eventType: 'payment.captured',
        receivedAt: hoursAgo(5),
        attempts: 3,
        lastError: 'ORDER_NOT_FOUND: no order for rzp order_XYZ',
        processed: false,
      },
      {
        id: 42,
        provider: 'shiprocket',
        eventType: 'shipment.status',
        receivedAt: hoursAgo(30),
        attempts: 1,
        lastError: 'Timeout talking to Redis',
        processed: false,
      },
    ],
  }).events;

  const auditEntries = Array.from({ length: 60 }, (_, i) => ({
    id: 1000 - i,
    action: ['ORDER_REFUND', 'SETTING_UPDATE', 'ORDER_NOTE', 'SETTLEMENT_FINALIZE', 'STAFF_CREATE'][i % 5]!,
    entityType: ['ORDER', 'SETTING', 'ORDER', 'SETTLEMENT', 'USER'][i % 5]!,
    entityId:
      i % 5 === 1
        ? 'reservation_ttl_minutes'
        : i % 5 === 3
          ? uuid(701)
          : (orders[i % orders.length]?.row.orderCode ?? 'PK-7KQ2M9'),
    actor: { id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f', email: 'asha@pahadikhatki.in' },
    before: i % 5 === 1 ? { value: 15 } : null,
    after: i % 5 === 1 ? { value: 20 } : { amountPaise: 39900 },
    ip: '103.21.58.4',
    createdAt: hoursAgo(i * 3),
  }));

  const dashboard = () =>
    AdminDashboardResponseSchema.parse({
      awaitingPacking: orders.filter(TAB_MATCH.awaiting_packing).length,
      needsAttention: orders.filter(TAB_MATCH.attention).length,
      ndr: orders.filter(TAB_MATCH.ndr).length,
      inTransit: orders.filter(TAB_MATCH.in_transit).length,
      revenueToday: { grossPaise: 119700, exGstPaise: 114000, orders: 3 },
      revenueMonth: { grossPaise: 2487300, exGstPaise: 2368857, orders: 61 },
      sellableJars: 150,
      batchesExpiringIn30Days: 1,
      ordersPerDay: Array.from({ length: 30 }, (_, i) => {
        const orders = Math.max(0, Math.round(3 + 2.5 * Math.sin(i / 3) + (i % 7 === 5 ? 3 : 0)));
        return { date: addDays(today, i - 29), orders, grossPaise: orders * 41500 };
      }),
      revenueByProduct: [
        { title: 'Himachali Chicken Pickle 250 g', jars: 38, grossPaise: 1516200 },
        { title: 'Pahadi Mutton Pickle 250 g', jars: 12, grossPaise: 658800 },
        { title: 'Himachali Chicken Pickle 500 g', jars: 4, grossPaise: 299600 },
      ],
      generatedAt: new Date().toISOString(),
    });

  // 24 IST hourly buckets, oldest first ("YYYY-MM-DDTHH:00")
  const opsMetrics = () => {
    const ist = new Date(Date.now() + 330 * 60_000);
    return AdminOpsMetricsResponseSchema.parse({
      ordersByHour: Array.from({ length: 24 }, (_, i) => {
        const t = new Date(ist.getTime() - (23 - i) * 3_600_000);
        const h = t.getUTCHours();
        return {
          hour: `${t.toISOString().slice(0, 13)}:00`,
          orders: h < 7 ? 0 : Math.max(0, Math.round(1.5 + 1.5 * Math.sin((h - 9) / 2.4))),
        };
      }),
      refunds30d: { count: 3, processedPaise: 124700 },
      shipped30d: 58,
      ndrRatePercent30d: 6.9,
      rtoRatePercent30d: 3.4,
    });
  };

  const customers = () => {
    const byPhone = new Map<string, MockOrder[]>();
    for (const o of orders) byPhone.set(o.phone, [...(byPhone.get(o.phone) ?? []), o]);
    return [...byPhone.entries()].map(([phone, list]) => {
      const rto = list.filter((o) => o.row.status.startsWith('RTO')).length;
      return {
        phone,
        userId: phone.endsWith('10') ? uuid(900) : null,
        name: list[0]!.row.customerName,
        ordersCount: list.length,
        lifetimeValuePaise: list.reduce((n, o) => n + o.row.totalPaise, 0),
        lastOrderAt: list
          .map((o) => o.row.createdAt)
          .sort()
          .at(-1)!,
        rtoCount: rto,
        risk: rto > 0,
      };
    });
  };

  const csv = (route: Route, name: string, body: string) =>
    route.fulfill({
      status: 200,
      headers: {
        ...cors,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}"`,
      },
      body,
    });

  // Signed files (labels, invoices, statements, receipts) + receipt uploads — context level, so new tabs see them too
  const ctx = 'context' in page ? page.context() : page;
  await ctx.route(`${FILES}/**`, (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'PUT',
          'access-control-allow-headers': '*',
        },
      });
    if (route.request().method() === 'PUT') {
      record('receipt-put', { url: route.request().url(), headers: route.request().headers() });
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
  });

  const handler = async (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    const body = method === 'GET' || method === 'DELETE' ? undefined : (req.postDataJSON() as unknown);
    if (body !== undefined) record(`${method} ${path}`, body);

    // ── Partner settlements (KITCHEN_PARTNER, D-40) ──
    if (path.startsWith('/partner/settlements')) {
      if (role !== 'KITCHEN_PARTNER') return fail(route, 403, 'FORBIDDEN', 'Partners only');
      const visible = [...settlements.values()].filter((s) => s.settlement.status !== 'DRAFT');
      if (path === '/partner/settlements')
        return ok(route, {
          settlements: visible.map((s) => s.settlement).sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
        });
      const m = /^\/partner\/settlements\/([0-9a-f-]{36})(?:\/(acknowledge|statement))?$/.exec(path);
      const s = m && visible.find((x) => x.settlement.id === m[1]);
      if (!m || !s) return fail(route, 404, 'NOT_FOUND', 'Statement not found');
      if (m[2] === 'statement') return ok(route, signed(`statement-${s.settlement.id}.pdf`));
      if (m[2] === 'acknowledge') {
        if (s.settlement.partnerAcknowledgedAt) {
          acknowledgeCalls.push({ id: s.settlement.id, status: 409 });
          return fail(route, 409, 'INVALID_STATE', 'Already acknowledged');
        }
        s.settlement.partnerAcknowledgedAt = new Date().toISOString();
        acknowledgeCalls.push({ id: s.settlement.id, status: 200 });
        return ok(route, SettlementDetailSchema.parse(s));
      }
      return ok(route, s);
    }

    // ── Invoice (signed URL, Phase 5 endpoint) ──
    const invoice = /^\/orders\/(PK-[0-9A-Z]{6})\/invoice$/.exec(path);
    if (invoice) return ok(route, signed(`invoice-${invoice[1]}.pdf`));

    // ── Own password (staff, any role) ──
    if (path === '/auth/staff/change-password' && method === 'POST') {
      const p = ChangePasswordRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', p.error.issues[0]?.message ?? 'Invalid');
      if (p.data.currentPassword !== CURRENT_PASSWORD)
        return fail(route, 401, 'UNAUTHENTICATED', 'Your current password is incorrect.');
      return ok(route, {
        user: {
          id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
          role: role,
          fullName: 'Asha Negi',
          phoneMasked: null,
          email: 'asha@pahadikhatki.in',
          totpEnabled: true,
        },
      });
    }

    if (!path.startsWith('/admin/') || path.startsWith('/admin/products') || path.startsWith('/admin/uploads'))
      return route.fallback();
    if (role !== 'ADMIN') return fail(route, 403, 'FORBIDDEN', 'Admins only');

    if (path === '/admin/dashboard') return ok(route, dashboard());

    // ── Ops metrics + test alert (Phase 10 §10.3) ──
    if (path === '/admin/ops/metrics' && method === 'GET') return ok(route, opsMetrics());
    if (path === '/admin/ops/test-alert' && method === 'POST')
      return ok(
        route,
        AdminTestAlertResponseSchema.parse({
          ok: true,
          message: 'Test alert queued for 1 admin (WhatsApp + e-mail).',
        }),
      );

    // ── Orders ──
    if (path === '/admin/orders' && method === 'GET') {
      orderRequests.push(url.searchParams);
      const tab = (url.searchParams.get('tab') ?? 'all') as AdminOrderTab;
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const sort = url.searchParams.get('sort') ?? 'created_desc';
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
      const base = orders.filter(
        (o) =>
          (!q ||
            o.row.orderCode.toLowerCase().includes(q) ||
            o.phone.includes(q.replace(/^\+?91/, '')) ||
            (o.row.awbCode ?? '').includes(q)) &&
          (!from || o.row.createdAt.slice(0, 10) >= from) &&
          (!to || o.row.createdAt.slice(0, 10) <= to),
      );
      const list = base.filter(TAB_MATCH[tab]).sort((a, b) => {
        const [k, dir] = sort.split('_') as ['created' | 'total', 'asc' | 'desc'];
        const d = k === 'total' ? a.row.totalPaise - b.row.totalPaise : a.row.createdAt.localeCompare(b.row.createdAt);
        return dir === 'asc' ? d : -d;
      });
      return ok(
        route,
        AdminOrdersResponseSchema.parse({
          orders: list.slice((page - 1) * pageSize, page * pageSize).map((o) => o.row),
          page,
          pageSize,
          total: list.length,
          counts: Object.fromEntries(ADMIN_ORDER_TABS.map((t) => [t, base.filter(TAB_MATCH[t]).length])),
        }),
      );
    }
    const om = /^\/admin\/orders\/(PK-[0-9A-Z]{6})(?:\/(.+))?$/.exec(path);
    if (om) {
      const o = orders.find((x) => x.row.orderCode === om[1]);
      if (!o) return fail(route, 404, 'NOT_FOUND', 'Order not found');
      const action = om[2];
      if (!action) return ok(route, detailOf(o));
      if (action === 'label') return ok(route, signed(`label-${o.row.orderCode}.pdf`));
      const done = (message: string) => ok(route, { ok: true, message });
      if (action === 'cancel') {
        const p = AdminCancelOrderRequestSchema.safeParse(body);
        if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid cancel');
        if (!canTransition(o.row.status as OrderStatus, 'CANCELLED', 'ADMIN'))
          return fail(route, 409, 'INVALID_STATE', 'Can’t cancel now');
        // Same rule as orders.service cancel(): PAID needs the refund; only PAID gets one
        const wasPaid = o.row.paymentStatus === 'PAID';
        if (wasPaid && !p.data.refund)
          return fail(route, 422, 'VALIDATION_FAILED', 'A paid order must be refunded when cancelled.', {
            field: 'refund',
          });
        o.row.status = 'CANCELLED';
        if (wasPaid) {
          o.refunds.push({
            id: uuid(nextId++),
            amountPaise: o.row.totalPaise - refundedSoFar(o),
            reason: 'ADMIN_CANCEL',
            status: 'PENDING',
            notes: p.data.reason,
            createdAt: new Date().toISOString(),
            processedAt: null,
          });
          o.row.paymentStatus = 'REFUND_PENDING';
        }
        return ok(route, { orderCode: o.row.orderCode, status: 'CANCELLED' });
      }
      if (action === 'refunds') {
        const key = req.headers()['idempotency-key'] ?? '';
        const p = AdminRefundRequestSchema.safeParse(body);
        const prior = refundCalls.find((c) => c.key === key && c.status === 201);
        if (prior) {
          refundCalls.push({ key, body, status: 200 });
          return ok(route, { replayed: true });
        }
        if (!key || !p.success) {
          refundCalls.push({ key, body, status: 400 });
          return fail(route, 400, 'VALIDATION_ERROR', 'Invalid refund');
        }
        const refundable = o.row.totalPaise - refundedSoFar(o);
        if (p.data.amountPaise > refundable) {
          refundCalls.push({ key, body, status: 400 });
          return fail(route, 400, 'VALIDATION_ERROR', 'Amount is more than refundable');
        }
        o.refunds.push({
          id: uuid(nextId++),
          amountPaise: p.data.amountPaise,
          reason: p.data.reason,
          status: 'PENDING',
          notes: p.data.notes,
          createdAt: new Date().toISOString(),
          processedAt: null,
        });
        o.row.paymentStatus = p.data.amountPaise === refundable ? 'REFUND_PENDING' : 'PARTIALLY_REFUNDED';
        refundCalls.push({ key, body, status: 201 });
        return ok(route, { refundId: o.refunds.at(-1)!.id }, 201);
      }
      if (action === 'notifications/resend')
        return ResendNotificationRequestSchema.safeParse(body).success
          ? done('Queued on WhatsApp')
          : fail(route, 400, 'VALIDATION_ERROR', 'Bad template');
      if (action === 'retry-shipment') {
        o.bookingAttempts += 1;
        return done('Booking job queued');
      }
      if (action === 'resolve-issue') {
        if (!ResolveIssueRequestSchema.safeParse(body).success)
          return fail(route, 400, 'VALIDATION_ERROR', 'Note too short');
        o.opsIssueText = null;
        o.row.opsIssue = o.row.status === 'DELIVERY_FAILED';
        return done('Resolved');
      }
      if (action === 'notes') {
        const p = AddNoteRequestSchema.safeParse(body);
        if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Empty note');
        o.notes.push({ text: p.data.text, by: 'Asha Negi', at: new Date().toISOString() });
        return done('Note added');
      }
    }

    // ── Customers ──
    if (path === '/admin/customers') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const sort = url.searchParams.get('sort') ?? 'last_order_desc';
      const list = customers()
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))
        .sort((a, b) =>
          sort === 'ltv_desc'
            ? b.lifetimeValuePaise - a.lifetimeValuePaise
            : sort === 'orders_desc'
              ? b.ordersCount - a.ordersCount
              : b.lastOrderAt.localeCompare(a.lastOrderAt),
        );
      return ok(
        route,
        AdminCustomersResponseSchema.parse({ customers: list, page: 1, pageSize: 25, total: list.length }),
      );
    }
    const cm = /^\/admin\/customers\/(.+)$/.exec(path);
    if (cm) {
      const phone = decodeURIComponent(cm[1]!);
      const c = customers().find((x) => x.phone === phone);
      if (!c) return fail(route, 404, 'NOT_FOUND', 'Customer not found');
      return ok(
        route,
        AdminCustomerDetailSchema.parse({
          customer: { ...c, email: 'arun@example.com' },
          orders: orders.filter((o) => o.phone === phone).map((o) => o.row),
          addresses: [
            {
              id: uuid(950),
              line1: '12, Pine View Apartments',
              city: 'Chennai',
              state: 'Tamil Nadu',
              pincode: '600040',
              isDefault: true,
            },
          ],
        }),
      );
    }

    // ── Inventory ──
    if (path === '/admin/inventory/expiry-alerts')
      return ok(
        route,
        ExpiryAlertsResponseSchema.parse({
          batches: batches
            .filter((b) => b.shelfStatus === 'AGING' && b.availableStock > 0)
            .map((b) => ({
              batchId: b.id,
              batchCode: b.batchCode,
              productTitle: b.product.title,
              kitchenCode: b.pickupLocation.code,
              availableStock: b.availableStock,
              expiryDate: b.expiryDate,
              sellableUntil: addDays(b.expiryDate, -52),
              daysLeft: b.daysToExpiry - 52,
            })),
        }),
      );

    // ── Settings ──
    if (path === '/admin/settings' && method === 'GET') return ok(route, settings);
    if (path === '/admin/settings' && method === 'PATCH') {
      const p = SettingUpdateRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', p.error.issues[0]?.message ?? 'Invalid');
      const row = settings.settings.find((s) => s.key === p.data.key)!;
      row.value = p.data.value;
      row.updatedAt = new Date().toISOString();
      return ok(route, { setting: row });
    }

    // ── Staff ──
    if (path === '/admin/staff' && method === 'GET') return ok(route, { staff });
    if (path === '/admin/staff' && method === 'POST') {
      const p = StaffCreateRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid staff');
      if (staff.some((s) => s.email === p.data.email)) return fail(route, 409, 'DUPLICATE', 'Email already in use');
      const row = StaffRowSchema.parse({
        id: uuid(nextId++),
        email: p.data.email,
        fullName: p.data.fullName,
        phone: p.data.phone ?? null,
        role: p.data.role,
        isActive: true,
        pickupLocationIds: p.data.pickupLocationIds,
        totpEnabled: false,
        lastLoginAt: null,
      });
      staff.push(row);
      return ok(route, { staff: row }, 201);
    }
    const sm = /^\/admin\/staff\/([0-9a-f-]{36})$/.exec(path);
    if (sm && method === 'PATCH') {
      const p = StaffUpdateRequestSchema.safeParse(body);
      const s = staff.find((x) => x.id === sm[1]);
      if (!s) return fail(route, 404, 'NOT_FOUND', 'No such staff');
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid update');
      const { forceLogout: _f, ...rest } = p.data;
      Object.assign(s, rest);
      return ok(route, { staff: s });
    }

    const rp = /^\/admin\/staff\/([0-9a-f-]{36})\/reset-password$/.exec(path);
    if (rp && method === 'POST') {
      const p = StaffResetPasswordRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Request validation failed');
      if (rp[1] === '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f')
        return fail(route, 400, 'VALIDATION_ERROR', 'Change your own password from the Account page.');
      if (!staff.some((x) => x.id === rp[1])) return fail(route, 404, 'NOT_FOUND', 'Staff member not found.');
      passwordResets.push({ id: rp[1]!, password: p.data.password });
      return ok(route, { revokedSessions: 2 });
    }

    // ── Kitchens (pickup locations) ──
    if (path === '/admin/kitchens' && method === 'GET') return ok(route, { kitchens: kitchens.map(kitchenRow) });
    if (path === '/admin/kitchens' && method === 'POST') {
      const p = KitchenCreateRequestSchema.safeParse(body);
      if (!p.success)
        return fail(route, 400, 'VALIDATION_ERROR', 'Request validation failed', {
          issues: p.error.issues.map((i) => ({ path: `/${i.path.join('/')}`, message: i.message })),
        });
      const clash = kitchens.some(
        (k) =>
          k.code === p.data.code ||
          (p.data.shiprocketPickupName !== null && k.shiprocketPickupName === p.data.shiprocketPickupName),
      );
      if (clash)
        return fail(route, 409, 'DUPLICATE', 'A kitchen with this code or Shiprocket pickup name already exists.');
      const k = { id: uuid(nextId++), ...p.data, isActive: true };
      kitchens.push(k);
      return ok(route, kitchenRow(k), 201);
    }
    const km = /^\/admin\/kitchens\/([0-9a-f-]{36})$/.exec(path);
    if (km && method === 'PATCH') {
      const k = kitchens.find((x) => x.id === km[1]);
      if (!k) return fail(route, 404, 'NOT_FOUND', 'Kitchen not found.');
      const p = KitchenUpdateRequestSchema.safeParse(body);
      if (!p.success)
        return fail(route, 400, 'VALIDATION_ERROR', 'Request validation failed', {
          issues: p.error.issues.map((i) => ({ path: `/${i.path.join('/')}`, message: i.message })),
        });
      const name = p.data.shiprocketPickupName;
      if (name && kitchens.some((x) => x.id !== k.id && x.shiprocketPickupName === name))
        return fail(route, 409, 'DUPLICATE', 'Another kitchen already uses this Shiprocket pickup name.');
      Object.assign(k, p.data);
      return ok(route, kitchenRow(k));
    }

    // ── Expenses ──
    if (path === '/admin/expenses' && method === 'GET') {
      const cat = url.searchParams.get('category');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const list = expenses
        .filter((e) => (!cat || e.category === cat) && (!from || e.incurredOn >= from) && (!to || e.incurredOn <= to))
        .sort((a, b) => b.incurredOn.localeCompare(a.incurredOn));
      return ok(
        route,
        ExpensesResponseSchema.parse({
          expenses: list,
          page: 1,
          pageSize: 25,
          total: list.length,
          totalPaise: list.reduce((n, e) => n + e.amountPaise, 0),
        }),
      );
    }
    if (path === '/admin/expenses' && method === 'POST') {
      const p = ExpenseCreateRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid expense');
      const who = staff.find((s) => s.id === p.data.paidById);
      const row = ExpenseRowSchema.parse({
        id: uuid(nextId++),
        ...p.data,
        paidById: undefined,
        paidBy: who ? { id: who.id, name: who.fullName ?? who.email } : null,
        receiptAvailable: false,
        settlementId: null,
        locked: false,
        createdAt: new Date().toISOString(),
      });
      expenses.push(row);
      return ok(route, { expense: row }, 201);
    }
    const em = /^\/admin\/expenses\/([0-9a-f-]{36})(?:\/(receipt-upload|receipt))?$/.exec(path);
    if (em) {
      const e = expenses.find((x) => x.id === em[1]);
      if (!e) return fail(route, 404, 'NOT_FOUND', 'No such expense');
      if (em[2] === 'receipt') return ok(route, signed(`receipt-${e.id}.pdf`));
      if (e.locked) return fail(route, 409, 'INVALID_STATE', 'Expense is in a finalized settlement');
      if (em[2] === 'receipt-upload') {
        const p = ReceiptUploadRequestSchema.safeParse(body);
        if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Bad file');
        const key = `receipts/${e.id}/${uuid(nextId++)}.pdf`;
        return ok(route, {
          key,
          uploadUrl: `${FILES}/${key}?sig=put`,
          method: 'PUT',
          headers: { 'content-type': p.data.contentType },
        });
      }
      if (method === 'DELETE') {
        expenses.splice(expenses.indexOf(e), 1);
        return ok(route, { ok: true });
      }
      if (method === 'PATCH') {
        const p = ExpenseUpdateRequestSchema.safeParse(body);
        if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid update');
        const { receiptKey, paidById, ...rest } = p.data;
        Object.assign(e, rest);
        if (paidById !== undefined) {
          const who = staff.find((s) => s.id === paidById);
          e.paidBy = who ? { id: who.id, name: who.fullName ?? who.email } : null;
        }
        if (receiptKey) e.receiptAvailable = true;
        return ok(route, { expense: e });
      }
    }

    // ── Settlements ──
    if (path === '/admin/settlements' && method === 'GET')
      return ok(route, {
        settlements: [...settlements.values()]
          .map((s) => s.settlement)
          .sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
      });
    if (path === '/admin/settlements' && method === 'POST') {
      const p = SettlementGenerateRequestSchema.safeParse(body);
      if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid period');
      const period = expenses.filter(
        (e) => !e.settlementId && e.incurredOn >= p.data.periodStart && e.incurredOn <= p.data.periodEnd,
      );
      const seeds: SettlementItemSeed[] = [
        workedExample('PK-6AB190'),
        {
          ...workedExample('PK-6AB191'),
          jars: 3,
          revenue: 114000,
          raw: 36001,
          freight: missingData ? null : 11000,
          fee: 2827,
        },
        { ...workedExample('PK-6AB192'), revenue: 19000, refunds: 19000, freight: 8500, fee: 942 },
      ];
      const d = buildSettlement(
        uuid(nextId++),
        p.data.periodStart,
        p.data.periodEnd,
        'DRAFT',
        seeds,
        period,
        { createdAt: new Date().toISOString() },
        p.data.partnerSplitBp ?? 5000,
      );
      settlements.set(d.settlement.id, d);
      for (const e of period) e.settlementId = d.settlement.id;
      return ok(route, d, 201);
    }
    const stm = /^\/admin\/settlements\/([0-9a-f-]{36})(?:\/(finalize|mark-paid|statement))?$/.exec(path);
    if (stm) {
      const s = settlements.get(stm[1]!);
      if (!s) return fail(route, 404, 'NOT_FOUND', 'Settlement not found');
      const action = stm[2];
      if (!action && method === 'GET') return ok(route, s);
      if (!action && method === 'DELETE') {
        if (s.settlement.status !== 'DRAFT') return fail(route, 409, 'INVALID_STATE', 'Only drafts can be deleted');
        for (const e of expenses) if (e.settlementId === s.settlement.id) e.settlementId = null;
        settlements.delete(s.settlement.id);
        return ok(route, { ok: true });
      }
      if (action === 'statement') return ok(route, signed(`statement-${s.settlement.id}.pdf`));
      if (action === 'finalize') {
        if (s.settlement.status !== 'DRAFT' || !s.canFinalize)
          return fail(route, 409, 'INVALID_STATE', 'Fix the warnings first');
        s.settlement.status = 'FINALIZED';
        s.settlement.finalizedAt = new Date().toISOString();
        s.canFinalize = false;
        s.statementAvailable = true;
        for (const e of expenses) if (e.settlementId === s.settlement.id) e.locked = true;
        return ok(route, s);
      }
      if (action === 'mark-paid') {
        const p = MarkPaidRequestSchema.safeParse(body);
        if (!p.success) return fail(route, 400, 'VALIDATION_ERROR', 'Invalid payment');
        if (s.settlement.status !== 'FINALIZED') return fail(route, 409, 'INVALID_STATE', 'Finalize first');
        Object.assign(s.settlement, { status: 'PAID', paidAt: p.data.paidAt, bankReference: p.data.bankReference });
        return ok(route, s);
      }
    }

    // ── Exports (CSV) ──
    const ex = /^\/admin\/exports\/([a-z-]+)$/.exec(path);
    if (ex) {
      record('export', { type: ex[1], query: url.search });
      return csv(route, `${ex[1]}-${url.searchParams.get('from') ?? 'all'}.csv`, 'col_a,col_b\n1,2\n');
    }

    // ── Ops ──
    if (path === '/admin/webhooks/failures') return ok(route, { events: webhookEvents });
    const wm = /^\/admin\/webhooks\/(\d+)\/replay$/.exec(path);
    if (wm) {
      const e = webhookEvents.find((x) => x.id === Number(wm[1]));
      if (!e) return fail(route, 404, 'NOT_FOUND', 'No such event');
      e.processed = true;
      e.attempts += 1;
      return ok(route, { ok: true, message: 'Processed on replay' });
    }
    if (path.startsWith('/admin/queues'))
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>bull-board</title><h1>Queues</h1>',
      });
    if (path === '/admin/audit-log') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
      const et = url.searchParams.get('entityType');
      const eid = url.searchParams.get('entityId');
      const act = url.searchParams.get('action');
      const list = auditEntries.filter(
        (e) => (!et || e.entityType === et) && (!eid || e.entityId.includes(eid)) && (!act || e.action === act),
      );
      return ok(
        route,
        AuditLogResponseSchema.parse({
          entries: list.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: list.length,
        }),
      );
    }

    return fail(route, 404, 'NOT_FOUND', `No admin mock for ${method} ${path}`);
  };

  await page.route(`${API}/**`, handler);

  return {
    orders,
    orderRequests,
    refundCalls,
    acknowledgeCalls,
    settlements,
    expenses,
    staff,
    kitchens,
    passwordResets,
    CURRENT_PASSWORD,
    bodies,
    resolveMissingData: () => {
      missingData = false;
    },
  };
}
