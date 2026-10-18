import type { Metadata } from 'next';
import { MyOrdersView } from '@/modules/orders';

export const metadata: Metadata = { title: 'My orders', robots: { index: false, follow: false } };

/** Thin route (D-44). `?page=` is the only URL state. */
export default async function MyOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { page } = await searchParams;
  const n = Number(typeof page === 'string' ? page : 1);
  return <MyOrdersView page={Number.isInteger(n) && n >= 1 && n <= 500 ? n : 1} />;
}
