/**
 * Razorpay Standard Checkout glue (Phase 5 §5.6). Only the bits we use are typed. The script itself is
 * loaded with next/script by PaymentHost (lazy, only on pages that can take a payment).
 */
export const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  error?: { code?: string; description?: string; reason?: string };
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  theme?: { color?: string };
  /** Seconds before the modal closes itself — the jar reservation's remaining time. */
  timeout?: number;
  config?: unknown;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
  handler: (resp: RazorpaySuccess) => void;
}

export interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: 'payment.failed', cb: (resp: RazorpayFailure) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** Waits for the lazily loaded script (it may still be downloading when Pay is tapped). */
export function waitForRazorpay(timeoutMs = 15_000): Promise<NonNullable<Window['Razorpay']>> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.Razorpay) return resolve(window.Razorpay);
      if (Date.now() - started > timeoutMs) return reject(new Error('RAZORPAY_SCRIPT_TIMEOUT'));
      window.setTimeout(check, 100);
    };
    check();
  });
}

/**
 * The brand CTA colour for the Razorpay modal, read from the live `--primary` token (never hard-coded,
 * Rules §1.4). Razorpay wants hex; any CSS colour the token holds is normalised through a 1×1 canvas.
 */
export function readPrimaryHex(): string | undefined {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  if (!raw) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return undefined;
  }
}

/** Phones: put UPI (intent → GPay / PhonePe / Paytm) first; other methods stay available below. */
export function upiFirstConfig(): unknown {
  const mobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  if (!mobile) return undefined;
  return {
    display: {
      blocks: { upi: { name: 'Pay using UPI', instruments: [{ method: 'upi' }] } },
      sequence: ['block.upi'],
      preferences: { show_default_blocks: true },
    },
  };
}
