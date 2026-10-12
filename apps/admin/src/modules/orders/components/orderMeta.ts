import type { ADMIN_REFUND_REASONS, AdminOrderTab, AdminOrdersQuery, RESENDABLE_TEMPLATES } from '@pk/shared';
import type { SortingState } from '@tanstack/react-table';

export const TAB_LABEL: Record<AdminOrderTab, string> = {
  all: 'All',
  attention: 'Needs attention',
  awaiting_packing: 'Awaiting packing',
  in_transit: 'In transit',
  ndr: 'NDR',
  rto: 'RTO',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const REFUND_REASON_LABEL: Record<(typeof ADMIN_REFUND_REASONS)[number], string> = {
  CUSTOMER_CANCEL: 'Customer cancelled',
  DAMAGED: 'Damaged in transit',
  RTO: 'Returned to origin (RTO)',
  LOST: 'Lost by courier',
  GOODWILL: 'Goodwill gesture',
};

export const TEMPLATE_LABEL: Record<(typeof RESENDABLE_TEMPLATES)[number], string> = {
  order_confirmed: 'Order confirmed',
  order_shipped: 'Order shipped',
  out_for_delivery: 'Out for delivery',
  delivered_storage_tip: 'Delivered + storage tip',
  delivery_attempt_failed: 'Delivery attempt failed',
  order_cancelled: 'Order cancelled',
  refund_processed: 'Refund processed',
};

export type OrderSort = NonNullable<AdminOrdersQuery['sort']>;
export const ORDER_SORTS: readonly OrderSort[] = ['created_desc', 'created_asc', 'total_desc', 'total_asc'];

/** Server sort param ↔ TanStack sorting state (column ids `createdAt` / `totalPaise`). */
export function sortToState(sort: OrderSort): SortingState {
  const [col, dir] = sort.split('_') as ['created' | 'total', 'asc' | 'desc'];
  return [{ id: col === 'created' ? 'createdAt' : 'totalPaise', desc: dir === 'desc' }];
}
export function stateToSort(s: SortingState): OrderSort {
  const first = s[0];
  if (!first) return 'created_desc';
  return `${first.id === 'totalPaise' ? 'total' : 'created'}_${first.desc ? 'desc' : 'asc'}` as OrderSort;
}

/** '+919876543210' → 'https://wa.me/919876543210' (click-to-WhatsApp). */
export const whatsappUrl = (e164: string, text?: string) =>
  `https://wa.me/${e164.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** '+919876543210' → '+91 98765 43210' */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

export const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replaceAll('_', ' ');
