import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { AccountMenu } from '@/modules/account';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader actions={<AccountMenu />} />
      {children}
    </>
  );
}
