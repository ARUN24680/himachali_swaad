import { PUBLISH_REQUIREMENTS, formatINR, type AdminProduct, type PublishRequirement } from '@pk/shared';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusBadge,
  cn,
} from '@pk/ui';
import { AlertCircle, CheckCircle2, Circle, EyeOff, Loader2, Rocket } from 'lucide-react';
import { useState } from 'react';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { usePublishProduct } from '../hooks/useProducts';
import { productStatus, REQUIREMENT_LABEL } from './productMeta';

function missingFromError(err: unknown): PublishRequirement[] | null {
  if (!isApiError(err, 'VALIDATION_FAILED')) return null;
  const m = err.details?.missing;
  return Array.isArray(m)
    ? m.filter((x): x is PublishRequirement => PUBLISH_REQUIREMENTS.includes(x as PublishRequirement))
    : null;
}

/** Status + publish checklist (D-49 / Phase 3 §3.2): lab, tax, label and photo data before going live. */
export function PublishPanel({ product, dirty }: { product: AdminProduct; dirty: boolean }) {
  const publish = usePublishProduct(product.id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const serverMissing = missingFromError(publish.error);
  const missing = new Set<PublishRequirement>(serverMissing ?? product.missingForPublish);
  const ready = missing.size === 0;

  const run = (live: boolean) =>
    publish.mutate(live, {
      onSuccess: (p) => {
        setConfirmOpen(false);
        toast({
          title: live ? `${p.title} is live` : `${p.title} is hidden`,
          description: live ? 'Customers can now see and buy it.' : 'It no longer shows on the storefront.',
        });
      },
    });

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Storefront status</CardTitle>
          <StatusBadge status={productStatus(product)} />
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/60 p-3 text-sm">
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Price (MRP incl. GST)</dt>
            <dd className="font-semibold tabular-nums">{formatINR(product.pricePaise)}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">Sellable jars</dt>
            <dd className="font-semibold tabular-nums">
              {product.stock.sellable}{' '}
              <span className="font-normal text-muted-foreground">/ {product.stock.onHand} on hand</span>
            </dd>
          </div>
        </dl>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!product.isActive && (
          <div className="grid gap-2">
            <p className="text-sm font-medium">Publish checklist</p>
            <ul className="grid gap-1" aria-label="Publish checklist">
              {PUBLISH_REQUIREMENTS.map((req) => {
                const done = !missing.has(req);
                const { label, section } = REQUIREMENT_LABEL[req];
                return (
                  <li key={req}>
                    <a
                      href={`#${section}`}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                        done ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {done ? (
                        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
                      ) : (
                        <Circle aria-hidden="true" className="size-4 shrink-0 text-warning" />
                      )}
                      <span className={cn(done && 'line-through decoration-muted-foreground/50')}>{label}</span>
                      <span className="sr-only">{done ? '(done)' : '(missing)'}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {serverMissing && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            Can’t publish yet — fill: {serverMissing.map((r) => REQUIREMENT_LABEL[r].label.toLowerCase()).join(', ')}.
          </Alert>
        )}
        {publish.isError && !serverMissing && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            {publish.error.message}
          </Alert>
        )}

        {product.isActive ? (
          <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={publish.isPending}>
            <EyeOff aria-hidden="true" />
            Unpublish
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => run(true)} disabled={!ready || dirty || publish.isPending}>
              {publish.isPending ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Rocket aria-hidden="true" />
              )}
              Publish to storefront
            </Button>
            <p className="text-xs text-muted-foreground">
              {dirty
                ? 'Save your changes first.'
                : ready
                  ? 'Everything required is in. Publishing makes it visible and buyable.'
                  : `${missing.size} item${missing.size === 1 ? '' : 's'} left before this can go live.`}
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent layout="sheet">
          <DialogHeader>
            <DialogTitle>Hide {product.title}?</DialogTitle>
            <DialogDescription>
              It disappears from the storefront straight away. Batches and stock stay as they are, and you can publish
              again any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep it live</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => run(false)} disabled={publish.isPending}>
              {publish.isPending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              Unpublish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
