import { formatINR, type Batch } from '@pk/shared';
import {
  Badge,
  Button,
  Progress,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@pk/ui';
import { History, SlidersHorizontal } from 'lucide-react';
import { formatCalendarDate } from '@/lib/dates';
import { expiryText, SHELF_HELP, SHELF_LABEL } from './batchMeta';

interface Props {
  batches: Batch[];
  showKitchen: boolean;
  onLedger: (b: Batch) => void;
  onAdjust: (b: Batch) => void;
}

function JarsLeft({ b }: { b: Batch }) {
  const pct = b.initialQuantity > 0 ? Math.round((b.availableStock / b.initialQuantity) * 100) : 0;
  return (
    <div className="grid gap-1">
      <span className="tabular-nums">
        <span className="font-semibold">{b.availableStock}</span>
        <span className="text-muted-foreground"> / {b.initialQuantity}</span>
      </span>
      <Progress value={pct} aria-label={`${pct}% of batch left`} className="h-1 w-20" />
    </div>
  );
}

function Shelf({ b }: { b: Batch }) {
  return (
    <span className="grid justify-items-start gap-1">
      <StatusBadge status={b.shelfStatus} label={SHELF_LABEL[b.shelfStatus]} title={SHELF_HELP[b.shelfStatus]} />
      <span className={cn('text-xs tabular-nums', b.daysToExpiry <= 0 ? 'text-destructive' : 'text-muted-foreground')}>
        {expiryText(b.daysToExpiry)}
      </span>
    </span>
  );
}

/** FIFO-ordered batches (server order kept). Table on lg+, cards on phones and tablets. */
export function BatchesTable({ batches, showKitchen, onLedger, onAdjust }: Props) {
  return (
    <>
      <ul className="divide-y divide-border lg:hidden">
        {batches.map((b) => (
          <li key={b.id} className="grid gap-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1">
                <Badge tone="batch" className="w-fit">
                  {b.batchCode}
                </Badge>
                <span className="truncate font-medium">{b.product.title}</span>
                <span className="text-xs text-muted-foreground">
                  {b.product.netWeightG} g{showKitchen && ` · ${b.pickupLocation.name}`} ·{' '}
                  {formatINR(b.costPerUnitPaise)}/jar
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-semibold tabular-nums">{b.availableStock}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">of {b.initialQuantity} jars</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Shelf b={b} />
              <span className="text-xs text-muted-foreground tabular-nums">
                Made {formatCalendarDate(b.manufacturedAt)} · Exp {formatCalendarDate(b.expiryDate)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onLedger(b)} aria-label={`Ledger for ${b.batchCode}`}>
                <History aria-hidden="true" />
                Ledger
              </Button>
              <Button variant="outline" onClick={() => onAdjust(b)} aria-label={`Adjust stock for ${b.batchCode}`}>
                <SlidersHorizontal aria-hidden="true" />
                Adjust
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Table aria-label="Batches, oldest expiry first" containerClassName="hidden lg:block">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Batch</TableHead>
            {showKitchen && <TableHead>Kitchen</TableHead>}
            <TableHead>Made / Expires</TableHead>
            <TableHead>Shelf status</TableHead>
            <TableHead>Jars left</TableHead>
            <TableHead className="text-right">Cost / jar</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => (
            <TableRow key={b.id} className={cn(b.availableStock === 0 && 'text-muted-foreground')}>
              <TableCell className="min-w-56">
                <div className="grid gap-1">
                  <Badge tone="batch" className="w-fit">
                    {b.batchCode}
                  </Badge>
                  <span className="text-sm font-medium text-foreground">{b.product.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.product.sku} · {b.product.netWeightG} g
                  </span>
                </div>
              </TableCell>
              {showKitchen && <TableCell className="whitespace-nowrap">{b.pickupLocation.name}</TableCell>}
              <TableCell className="whitespace-nowrap tabular-nums">
                <span className="grid gap-0.5">
                  <span>{formatCalendarDate(b.manufacturedAt)}</span>
                  <span className="text-xs text-muted-foreground">→ {formatCalendarDate(b.expiryDate)}</span>
                </span>
              </TableCell>
              <TableCell className="min-w-32">
                <Shelf b={b} />
              </TableCell>
              <TableCell>
                <JarsLeft b={b} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(b.costPerUnitPaise)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onLedger(b)}
                    aria-label={`Ledger for ${b.batchCode}`}
                  >
                    <History />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11"
                    onClick={() => onAdjust(b)}
                    aria-label={`Adjust stock for ${b.batchCode}`}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    Adjust
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
