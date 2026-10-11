/**
 * Brand + seller/legal facts — the ONE place the storefront reads them from (Phase 4 §4.2).
 *
 * Never invent a business identifier. Facts that depend on open questions (Q-02 legal entity,
 * GSTIN, FSSAI licence, grievance officer, address, contact channels) come from NEXT_PUBLIC_SELLER_*
 * env vars; an empty value renders a visible "Pending" marker (components/common/PendingValue).
 * Policy numbers that depend on Q-03 / Q-04 come from NEXT_PUBLIC_POLICY_* the same way.
 *
 * Every process.env reference is spelled out so Next can inline NEXT_PUBLIC_* into client bundles.
 */
const v = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const site = {
  name: 'Pahadi Khatki',
  tagline: 'Himachali non-veg pickles, made in small batches',
  description:
    'Small-batch Himachali chicken, mutton and fish pickles slow-cooked in mustard oil with hand-pounded pahadi spices. No added preservatives, prepaid delivery across India.',
  locale: 'en_IN',
} as const;

/** Seller details shown in the footer, contact and legal pages (Consumer Protection (E-Commerce) Rules 2020). */
export const seller = {
  /** Q-02 — legal entity that holds FSSAI + GST registrations. */
  legalName: v(process.env.NEXT_PUBLIC_SELLER_LEGAL_NAME),
  /** Registered / principal place of business. */
  address: v(process.env.NEXT_PUBLIC_SELLER_ADDRESS),
  fssaiLicenseNo: v(process.env.NEXT_PUBLIC_SELLER_FSSAI_NO),
  gstin: v(process.env.NEXT_PUBLIC_SELLER_GSTIN),
  phone: v(process.env.NEXT_PUBLIC_SELLER_PHONE),
  email: v(process.env.NEXT_PUBLIC_SELLER_EMAIL),
  /** Digits only with country code, e.g. 919876543210 — used for wa.me links. */
  whatsapp: v(process.env.NEXT_PUBLIC_SELLER_WHATSAPP),
  supportHours: v(process.env.NEXT_PUBLIC_SELLER_SUPPORT_HOURS),
  grievanceOfficer: {
    name: v(process.env.NEXT_PUBLIC_SELLER_GRIEVANCE_NAME),
    designation: v(process.env.NEXT_PUBLIC_SELLER_GRIEVANCE_DESIGNATION),
    email: v(process.env.NEXT_PUBLIC_SELLER_GRIEVANCE_EMAIL),
    phone: v(process.env.NEXT_PUBLIC_SELLER_GRIEVANCE_PHONE),
  },
} as const;

/** Policy facts tied to open business questions. Text values, rendered verbatim when set. */
export const policy = {
  /** Q-03 — e.g. "₹999" or "3 jars". Live progress in the cart always comes from the quote API. */
  freeShippingRule: v(process.env.NEXT_PUBLIC_POLICY_FREE_SHIPPING),
  /** Q-04 — refund on a prepaid order returned undelivered (RTO), e.g. "full refund minus forward freight". */
  rtoRefundRule: v(process.env.NEXT_PUBLIC_POLICY_RTO_REFUND),
  /** Q-04 — how soon a transit-damage claim must be raised, e.g. "48 hours of delivery". */
  damageClaimWindow: v(process.env.NEXT_PUBLIC_POLICY_DAMAGE_CLAIM_WINDOW),
  /** Q-04 — whether an unboxing video is required, e.g. "an unboxing video is required". */
  damageEvidence: v(process.env.NEXT_PUBLIC_POLICY_DAMAGE_EVIDENCE),
  /** Days for a refund to reach the original payment method once approved. */
  refundTimeline: v(process.env.NEXT_PUBLIC_POLICY_REFUND_TIMELINE),
  /** Date the legal pages were last reviewed (display text). */
  lastUpdated: v(process.env.NEXT_PUBLIC_POLICY_LAST_UPDATED),
} as const;
