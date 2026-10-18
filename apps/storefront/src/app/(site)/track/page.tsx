import { ORDER_CODE_REGEX, normalizeOrderCode } from '@pk/shared/order';
import type { Metadata } from 'next';
import { TrackView } from '@/modules/tracking';

export const metadata: Metadata = {
  title: 'Track your order',
  description: 'Follow your Pahadi Khatki parcel from our Himachal kitchen to your door.',
  robots: { index: false, follow: false },
};

/** Thin route (D-44). `?code=` prefills the order code only; the phone is always typed (D-39). */
export default async function TrackPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams;
  const raw = typeof code === 'string' ? code.slice(0, 20) : '';
  const normalized = raw ? normalizeOrderCode(raw) : '';
  return <TrackView initialCode={ORDER_CODE_REGEX.test(normalized) ? normalized : ''} />;
}
