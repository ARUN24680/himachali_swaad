import type { CreateOrderRequest } from '@pk/shared';
import { PHONE_REGEX, PINCODE_REGEX } from '@pk/shared/patterns';
import type { CartItem } from '@/modules/cart';

/**
 * Checkout form model + zod-free validation (D-51 b). Rules mirror CheckoutCustomerSchema /
 * CheckoutAddressSchema in @pk/shared; the server re-validates and its issues map back to fields.
 */
export interface CheckoutFormValues {
  fullName: string;
  /** 10 national digits; +91 is added on submit. */
  phoneDigits: string;
  email: string;
  pincode: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  orderUpdates: boolean;
  whatsappOptIn: boolean;
  saveAddress: boolean;
}

export type FieldKey =
  'fullName' | 'phone' | 'email' | 'pincode' | 'line1' | 'line2' | 'landmark' | 'city' | 'state' | 'orderUpdates';

export type FieldErrors = Partial<Record<FieldKey, string>>;

/** DOM order — the first invalid field in this list gets focus. */
export const FIELD_ORDER: FieldKey[] = [
  'fullName',
  'phone',
  'email',
  'pincode',
  'line1',
  'line2',
  'landmark',
  'city',
  'state',
  'orderUpdates',
];

export const fieldId = (k: FieldKey) => `checkout-${k}`;

export const EMPTY_FORM: CheckoutFormValues = {
  fullName: '',
  phoneDigits: '',
  email: '',
  pincode: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  orderUpdates: false,
  whatsappOptIn: false, // DPDP: separate, default OFF (Rules §4.4)
  saveAddress: false,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCheckout(v: CheckoutFormValues): FieldErrors {
  const e: FieldErrors = {};
  const len = (s: string) => s.trim().length;
  if (len(v.fullName) < 2) e.fullName = 'Enter your full name';
  else if (len(v.fullName) > 120) e.fullName = 'Name is too long';
  if (!PHONE_REGEX.test(`+91${v.phoneDigits}`))
    e.phone = v.phoneDigits.length < 10 ? 'Enter your 10-digit mobile number' : 'Enter a valid Indian mobile number';
  if (v.email.trim() && (!EMAIL_REGEX.test(v.email.trim()) || len(v.email) > 254)) e.email = 'Enter a valid email';
  if (!PINCODE_REGEX.test(v.pincode)) e.pincode = 'Enter a valid 6-digit pincode';
  if (len(v.line1) < 3) e.line1 = 'Enter house no. and street';
  else if (len(v.line1) > 200) e.line1 = 'Keep this under 200 characters';
  if (len(v.line2) > 200) e.line2 = 'Keep this under 200 characters';
  if (len(v.landmark) > 120) e.landmark = 'Keep this under 120 characters';
  if (len(v.city) < 2) e.city = 'Enter city';
  if (len(v.state) < 2) e.state = 'Enter state';
  if (!v.orderUpdates) e.orderUpdates = 'Please allow order updates — we need them to deliver your jars';
  return e;
}

const opt = (s: string) => (s.trim() ? s.trim() : undefined);

export function toCreateOrderRequest(v: CheckoutFormValues, items: CartItem[], loggedIn: boolean): CreateOrderRequest {
  return {
    items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    customer: { fullName: v.fullName.trim(), phone: `+91${v.phoneDigits}`, email: opt(v.email) },
    shippingAddress: {
      line1: v.line1.trim(),
      line2: opt(v.line2),
      landmark: opt(v.landmark),
      city: v.city.trim(),
      state: v.state.trim(),
      pincode: v.pincode,
    },
    ...(loggedIn ? { saveAddress: v.saveAddress } : {}),
    consent: { orderUpdates: true, whatsappOptIn: v.whatsappOptIn },
  };
}

const PATH_TO_FIELD: Record<string, FieldKey> = {
  '/customer/fullName': 'fullName',
  '/customer/phone': 'phone',
  '/customer/email': 'email',
  '/shippingAddress/line1': 'line1',
  '/shippingAddress/line2': 'line2',
  '/shippingAddress/landmark': 'landmark',
  '/shippingAddress/city': 'city',
  '/shippingAddress/state': 'state',
  '/shippingAddress/pincode': 'pincode',
  '/consent/orderUpdates': 'orderUpdates',
};

/** `VALIDATION_ERROR.details.issues[{ path: '/customer/phone', message }]` → field errors. */
export function mapServerIssues(details: Record<string, unknown> | undefined): FieldErrors {
  const issues = Array.isArray(details?.issues) ? (details.issues as { path?: unknown; message?: unknown }[]) : [];
  const out: FieldErrors = {};
  for (const issue of issues) {
    const path = typeof issue.path === 'string' ? issue.path.replace(/\./g, '/') : '';
    const key = PATH_TO_FIELD[path.startsWith('/') ? path : `/${path}`];
    if (key && !out[key]) out[key] = typeof issue.message === 'string' ? issue.message : 'Check this field';
  }
  return out;
}
