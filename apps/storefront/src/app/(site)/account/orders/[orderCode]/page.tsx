import { ORDER_CODE_REGEX, normalizeOrderCode } from '@pk/shared/order';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { MyOrderDetailView } from '@/modules/orders';

export const metadata: Metadata = { title: 'Order details', robots: { index: false, follow: false } };

/** Thin route (D-44). Hand-typed codes are normalised; anything else is a 404. */
export default async function MyOrderPage({ params }: { params: Promise<{ orderCode: string }> }) {
  const { orderCode: raw } = await params;
  const decoded = decodeURIComponent(raw);
  const code = normalizeOrderCode(decoded);
  if (!ORDER_CODE_REGEX.test(code)) notFound();
  if (code !== decoded) redirect(`/account/orders/${code}`);
  return <MyOrderDetailView orderCode={code} />;
}
