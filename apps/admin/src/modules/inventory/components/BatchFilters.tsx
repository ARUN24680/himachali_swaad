import { SHELF_STATUSES, type BatchProductOption, type ShelfStatus } from '@pk/shared';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Switch,
  cn,
} from '@pk/ui';
import { ListFilter } from 'lucide-react';
import { useId } from 'react';
import { SHELF_LABEL } from './batchMeta';

export interface BatchFilterState {
  productId: string | null;
  status: ShelfStatus | null;
  includeEmpty: boolean;
}

interface Props {
  value: BatchFilterState;
  onChange: (next: Partial<BatchFilterState>) => void;
  products: BatchProductOption[] | undefined;
  resultCount?: number;
}

function Controls({ value, onChange, products, stacked }: Props & { stacked?: boolean }) {
  const ids = { product: useId(), status: useId(), empty: useId() };
  return (
    <div className={cn('flex gap-3', stacked ? 'flex-col' : 'flex-row items-center')}>
      <div className={cn('grid gap-1.5', !stacked && 'w-56')}>
        <Label htmlFor={ids.product} className={cn(!stacked && 'sr-only')}>
          Product
        </Label>
        <Select value={value.productId ?? 'all'} onValueChange={(v) => onChange({ productId: v === 'all' ? null : v })}>
          <SelectTrigger id={ids.product}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {products?.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title} · {p.netWeightG} g
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={cn('grid gap-1.5', !stacked && 'w-44')}>
        <Label htmlFor={ids.status} className={cn(!stacked && 'sr-only')}>
          Shelf status
        </Label>
        <Select
          value={value.status ?? 'all'}
          onValueChange={(v) => onChange({ status: v === 'all' ? null : (v as ShelfStatus) })}
        >
          <SelectTrigger id={ids.status}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {SHELF_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {SHELF_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={cn('flex min-h-11 items-center gap-3', stacked ? 'justify-between' : 'pl-1')}>
        <Label htmlFor={ids.empty} className="cursor-pointer font-normal whitespace-nowrap">
          Show empty batches
        </Label>
        <Switch id={ids.empty} checked={value.includeEmpty} onCheckedChange={(c) => onChange({ includeEmpty: c })} />
      </div>
    </div>
  );
}

const activeCount = (v: BatchFilterState) =>
  Number(Boolean(v.productId)) + Number(Boolean(v.status)) + Number(v.includeEmpty);

/** Inline filter bar on md+; a bottom sheet behind a "Filters" button on phones (Rules §1.1). */
export function BatchFilters(props: Props) {
  const n = activeCount(props.value);
  return (
    <>
      <div className="hidden md:block">
        <Controls {...props} />
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex-1">
              <ListFilter aria-hidden="true" />
              Filters
              {n > 0 && (
                <span className="rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground tabular-nums">
                  {n}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filter batches</SheetTitle>
              <SheetDescription>Oldest expiry is always listed first (FIFO).</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <Controls {...props} stacked />
            </SheetBody>
            <SheetFooter>
              {n > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => props.onChange({ productId: null, status: null, includeEmpty: false })}
                >
                  Clear all
                </Button>
              )}
              <SheetClose asChild>
                <Button variant="secondary">
                  {props.resultCount === undefined
                    ? 'Done'
                    : `Show ${props.resultCount} batch${props.resultCount === 1 ? '' : 'es'}`}
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        {n > 0 && (
          <Button
            variant="ghost"
            onClick={() => props.onChange({ productId: null, status: null, includeEmpty: false })}
          >
            Clear
          </Button>
        )}
      </div>
    </>
  );
}
