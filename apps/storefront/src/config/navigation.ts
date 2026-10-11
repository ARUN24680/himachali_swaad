export interface NavLink {
  href: string;
  label: string;
}

export const mainNav: NavLink[] = [
  { href: '/products', label: 'Shop pickles' },
  { href: '/about', label: 'Our story' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

/** Required for Razorpay KYC + Consumer Protection (E-Commerce) Rules 2020 — linked from every footer. */
export const legalNav: NavLink[] = [
  { href: '/privacy-policy', label: 'Privacy policy' },
  { href: '/terms', label: 'Terms of service' },
  { href: '/refund-cancellation', label: 'Refund & cancellation' },
  { href: '/shipping-policy', label: 'Shipping policy' },
  { href: '/grievance', label: 'Grievance redressal' },
];
