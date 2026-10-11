import { PendingValue } from '@/components/common/PendingValue';
import { seller } from '@/config/site';

/** Seller identity block reused by contact / grievance / terms pages. */
export function SellerCard() {
  const rows: [string, string | null][] = [
    ['Legal entity', seller.legalName],
    ['Registered address', seller.address],
    ['GSTIN', seller.gstin],
    ['FSSAI Lic. No.', seller.fssaiLicenseNo],
  ];
  return (
    <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
      {rows.map(([term, value]) => (
        <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words text-foreground">
            <PendingValue value={value} label={term} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
