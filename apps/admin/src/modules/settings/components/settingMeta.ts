import { formatINR, type EditableSettingKey } from '@pk/shared';

export type SettingGroup = 'shipping' | 'orders' | 'inventory' | 'finance' | 'other';
export type SettingKind = 'paise' | 'int' | 'decimal' | 'bp' | 'cod' | 'seller';

export interface SettingMeta {
  label: string;
  group: SettingGroup;
  kind: SettingKind;
  unit?: string;
  /** `null` allowed = "not decided yet" (Q-02 / Q-03). */
  nullable?: boolean;
}

export const GROUP_LABEL: Record<SettingGroup, string> = {
  shipping: 'Shipping',
  orders: 'Orders',
  inventory: 'Inventory',
  finance: 'Finance',
  other: 'Other',
};

export const SETTING_META: Record<EditableSettingKey, SettingMeta> = {
  free_shipping_threshold_paise: { label: 'Free shipping above', group: 'shipping', kind: 'paise', nullable: true },
  flat_shipping_fee_paise: { label: 'Flat shipping fee', group: 'shipping', kind: 'paise', nullable: true },
  pickup_cutoff_hour_ist: { label: 'Courier pickup cut-off', group: 'shipping', kind: 'int', unit: ':00 IST' },
  min_courier_rating: { label: 'Minimum courier rating', group: 'shipping', kind: 'decimal', unit: '/ 5' },
  max_courier_etd_days: { label: 'Slowest courier allowed', group: 'shipping', kind: 'int', unit: 'days' },
  shiprocket_wallet_min_paise: { label: 'Shiprocket wallet alert below', group: 'shipping', kind: 'paise' },
  reservation_ttl_minutes: { label: 'Checkout stock hold', group: 'orders', kind: 'int', unit: 'minutes' },
  max_qty_per_item: { label: 'Max jars per product per order', group: 'orders', kind: 'int', unit: 'jars' },
  cod_enabled: { label: 'Cash on delivery', group: 'orders', kind: 'cod' },
  cod_fee_paise: { label: 'COD fee', group: 'orders', kind: 'paise' },
  min_remaining_shelf_days: { label: 'Minimum shelf life at sale', group: 'inventory', kind: 'int', unit: 'days' },
  transit_buffer_days: { label: 'Transit buffer', group: 'inventory', kind: 'int', unit: 'days' },
  low_stock_threshold: { label: 'Low-stock warning at', group: 'inventory', kind: 'int', unit: 'jars' },
  packaging_cost_per_jar_paise: { label: 'Packaging cost per jar', group: 'finance', kind: 'paise' },
  partner_split_bp: { label: 'Kitchen partner profit share', group: 'finance', kind: 'bp' },
  seller_details: { label: 'Seller details (invoices)', group: 'finance', kind: 'seller', nullable: true },
};

export const metaFor = (key: string): SettingMeta | undefined => SETTING_META[key as EditableSettingKey];

export type SellerDetails = {
  legalName: string;
  gstin: string;
  addressLine: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
};

/** Human-readable value for the table (₹, %, units, "Not set"). */
export function formatSettingValue(key: string, value: unknown): string {
  const meta = metaFor(key);
  if (value === null || value === undefined) return 'Not set';
  if (!meta) return typeof value === 'string' ? value : JSON.stringify(value);
  switch (meta.kind) {
    case 'paise':
      return typeof value === 'number' ? formatINR(value) : String(value);
    case 'bp':
      return typeof value === 'number' ? `${value / 100}%` : String(value);
    case 'cod':
      return 'Off — prepaid only (COD is v2)';
    case 'seller': {
      const s = value as Partial<SellerDetails>;
      return [s.legalName, s.gstin && `GSTIN ${s.gstin}`].filter(Boolean).join(' · ') || 'Not set';
    }
    default:
      return `${String(value)}${meta.unit ? (meta.unit.startsWith(':') ? meta.unit : ` ${meta.unit}`) : ''}`;
  }
}
