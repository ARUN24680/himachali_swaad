import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NonVegMark,
  StatusBadge,
} from '@pk/ui';
import { formatINR } from '@pk/shared';
import { Plus, ShoppingBag } from 'lucide-react';

const SWATCHES = [
  ['bg-background text-foreground', 'background'],
  ['bg-card text-card-foreground', 'card'],
  ['bg-primary text-primary-foreground', 'primary'],
  ['bg-secondary text-secondary-foreground', 'secondary'],
  ['bg-tertiary text-tertiary-foreground', 'tertiary'],
  ['bg-muted text-muted-foreground', 'muted'],
  ['bg-accent text-accent-foreground', 'accent'],
  ['bg-success text-success-foreground', 'success'],
  ['bg-warning text-warning-foreground', 'warning'],
  ['bg-info text-info-foreground', 'info'],
  ['bg-destructive text-destructive-foreground', 'destructive'],
  ['bg-nonveg text-nonveg-foreground', 'nonveg'],
] as const;

function Specimen() {
  return (
    <div className="grid gap-6 rounded-xl border border-border bg-background p-4 text-foreground md:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {SWATCHES.map(([cls, name]) => (
          <div
            key={name}
            className={`${cls} flex min-h-16 items-end rounded-md border border-border p-2.5 text-xs font-semibold`}
          >
            {name}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button>
          <ShoppingBag /> Add to cart
        </Button>
        <Button variant="secondary">Our kitchen story</Button>
        <Button variant="outline">View batch</Button>
        <Button variant="destructive">Cancel order</Button>
        <Button variant="ghost" size="icon" aria-label="Add jar">
          <Plus />
        </Button>
        <Button variant="link">Storage tips</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <NonVegMark className="mt-1.5" />
            <CardTitle>Himachali chicken pickle</CardTitle>
          </div>
          <CardDescription>Slow-cooked in cold-pressed mustard oil · 250 g</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xl font-semibold tabular-nums">
            {formatINR(39900, { trimZeroPaise: true })}{' '}
            <span className="text-xs font-normal text-muted-foreground">MRP incl. of all taxes</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="batch">Batch PK-2610-CHK250-01</Badge>
            <Badge tone="neutral">Steeped 45 days</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {['DELIVERED', 'AWAITING_PACKING', 'IN_TRANSIT', 'CANCELLED', 'PENDING_PAYMENT', 'AGING'].map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>

      <div className="grid max-w-sm gap-1.5">
        <Label htmlFor="pin">Delivery pincode</Label>
        <Input id="pin" inputMode="numeric" defaultValue="600042" />
        <p className="text-xs text-muted-foreground">Chennai, Tamil Nadu · delivers in 4–6 days</p>
      </div>

      <div className="rounded-lg bg-secondary p-4 text-secondary-foreground">
        <p className="font-serif text-lg">Made in a Kullu valley kitchen</p>
        <p className="text-sm opacity-85">Small batches, cold-pressed mustard oil, no preservatives.</p>
      </div>
    </div>
  );
}

/** Phase 1 §1.9 evidence page: every token + core component, light and dark side by side. */
export default function TokensPage() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold md:text-4xl">Design tokens</h1>
        <p className="max-w-prose text-muted-foreground">
          Every colour comes from <code className="text-sm">packages/ui/src/styles/globals.css</code>. Change a token
          there and both panels update.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Light theme" className="grid gap-2">
          <h2 className="font-sans text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">Light</h2>
          <div className="light">
            <Specimen />
          </div>
        </section>
        <section aria-label="Dark theme" className="grid gap-2">
          <h2 className="font-sans text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">Dark</h2>
          <div className="dark">
            <Specimen />
          </div>
        </section>
      </div>
    </div>
  );
}
