import { can, type Capability, type Role } from '@pk/shared';
import { Boxes, LayoutDashboard, Package, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the role holds this capability (access matrix in @pk/shared). */
  capability: Capability;
  end?: boolean;
}

/** Role-aware navigation (Phase 3 §3.7). Overview becomes the ADMIN dashboard (Phase 9), hence dashboard:revenue. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, capability: 'dashboard:revenue', end: true },
  { to: '/products', label: 'Products', icon: Package, capability: 'catalog:manage' },
  { to: '/batches', label: 'Batches', icon: Boxes, capability: 'batches:manage' },
];

export const navItemsFor = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => can(role, item.capability));
