import { can, type Capability, type Role } from '@pk/shared';
import {
  Activity,
  Boxes,
  ClipboardCheck,
  FileDown,
  HandCoins,
  LayoutDashboard,
  Package,
  ReceiptIndianRupee,
  ScrollText,
  Settings,
  ShoppingBag,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavGroup = 'Operations' | 'Catalog & stock' | 'Finance' | 'System';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the role holds this capability (access matrix in @pk/shared). */
  capability: Capability;
  group: NavGroup;
  /** Pinned in the phone bottom bar; the rest live behind "More". */
  primary?: boolean;
  end?: boolean;
}

/** Role-aware navigation (Phase 3 §3.7 → Phase 9 admin console). KITCHEN_PARTNER sees only stock + desk. */
const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    capability: 'dashboard:revenue',
    group: 'Operations',
    primary: true,
    end: true,
  },
  { to: '/orders', label: 'Orders', icon: ShoppingBag, capability: 'orders:all', group: 'Operations', primary: true },
  { to: '/customers', label: 'Customers', icon: Users, capability: 'customers:read', group: 'Operations' },
  { to: '/desk', label: 'Packing desk', icon: ClipboardCheck, capability: 'packing:operate', group: 'Operations' },
  { to: '/products', label: 'Products', icon: Package, capability: 'catalog:manage', group: 'Catalog & stock' },
  {
    to: '/batches',
    label: 'Inventory',
    icon: Boxes,
    capability: 'batches:manage',
    group: 'Catalog & stock',
    primary: true,
  },
  { to: '/expenses', label: 'Expenses', icon: ReceiptIndianRupee, capability: 'settlements:manage', group: 'Finance' },
  {
    to: '/settlements',
    label: 'Settlements',
    icon: HandCoins,
    capability: 'settlements:manage',
    group: 'Finance',
    primary: true,
  },
  { to: '/exports', label: 'Exports', icon: FileDown, capability: 'orders:all', group: 'Finance' },
  { to: '/settings', label: 'Settings', icon: Settings, capability: 'settings:manage', group: 'System' },
  { to: '/staff', label: 'Staff', icon: UserCog, capability: 'settings:manage', group: 'System' },
  { to: '/audit-log', label: 'Audit log', icon: ScrollText, capability: 'settings:manage', group: 'System' },
  { to: '/ops', label: 'Queues & webhooks', icon: Activity, capability: 'queues:view', group: 'System' },
];

export const navItemsFor = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => can(role, item.capability));
