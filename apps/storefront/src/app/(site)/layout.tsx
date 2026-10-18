import type { ReactNode } from 'react';
import { SiteShell } from '@/app/_shell/SiteShell';

/** Every store route (shop, legal, account, checkout, order, track) gets the header + footer here. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
