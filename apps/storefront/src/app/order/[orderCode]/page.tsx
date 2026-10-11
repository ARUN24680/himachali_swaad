import { ORDER_CODE_REGEX, normalizeOrderCode } from '@pk/shared/order';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { OrderStatusView } from '@/modules/orders';

export const metadata: Metadata = { title: 'Your order', robots: { index: false, follow: false } };

/** Thin route (D-44). Codes typed by hand (lowercase, O for 0) are normalised; anything else is a 404. */
export default async function OrderPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode: raw } = await params;
  const decoded = decodeURIComponent(raw);
  const code = normalizeOrderCode(decoded);
  if (!ORDER_CODE_REGEX.test(code)) notFound();
  if (code !== decoded) redirect(`/order/${code}`);
  return <OrderStatusView orderCode={code} />;
}
