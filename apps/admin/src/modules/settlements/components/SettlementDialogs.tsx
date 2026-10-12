import { todayInIST } from '@pk/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@pk/ui';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { formatShortDate, monthRange } from '@/lib/dates';
import { percentToBasisPoints } from '@/lib/money-input';
import { toast } from '@/store/toast.store';
import { useGenerateSettlement, useSettlementActions } from '../hooks/useSettlements';

/** Presets: the latest complete fortnight (1–15 / 16–end) and last month. */
function presets(today: string) {
  const day = Number(today.slice(8, 10));
  const thisMonth = monthRange(today);
  const lastMonth = monthRange(today, -1);
  const fortnight =
    day > 15
      ? { from: thisMonth.from, to: `${thisMonth.from.slice(0, 8)}15` }
      : { from: `${lastMonth.from.slice(0, 8)}16`, to: lastMonth.to };
  return [
    { label: `${formatShortDate(fortnight.from)} – ${formatShortDate(fortnight.to)}`, ...fortnight },
    { label: 'Last month', ...lastMonth },
  ];
}

export function GenerateSettlementDialog({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
  const today = todayInIST();
  const options = presets(today);
  const generate = useGenerateSettlement();
  const navigate = useNavigate();
  const [from, setFrom] = useState(options[0]!.from);
  const [to, setTo] = useState(options[0]!.to);
  const [split, setSplit] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!from || !to) return setError('Choose both dates.');
    if (to < from) return setError('The end date must be on or after the start date.');
    if (to > today) return setError('A settlement can’t include future days.');
    const bp = split.trim() ? percentToBasisPoints(split) : undefined;
    if (bp === null || (bp !== undefined && bp > 10_000)) return setError('Partner share must be between 0 and 100%.');
    setError(null);
    generate.mutate(
      { periodStart: from, periodEnd: to, ...(bp !== undefined ? { partnerSplitBp: bp } : {}) },
      {
        onSuccess: (d) => {
          toast({
            title: 'Draft settlement ready',
            description: d.warnings.length
              ? `${d.warnings.length} warning(s) to fix before finalizing.`
              : 'Review it, then finalize.',
          });
          onOpenChange(false);
          void navigate(`/settlements/${d.settlement.id}`);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !generate.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Generate a settlement</DialogTitle>
            <DialogDescription>
              Takes every delivered, returned or closed order in the period that isn’t settled yet, plus unsettled
              expenses. It starts as a draft you can delete and regenerate.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <Button
                key={o.label}
                type="button"
                size="sm"
                variant={from === o.from && to === o.to ? 'secondary' : 'outline'}
                onClick={() => {
                  setFrom(o.from);
                  setTo(o.to);
                }}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="From">
              <Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} />
            </FormField>
            <FormField label="To">
              <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Partner share" optional hint="Leave empty to use the default from Settings (50%).">
            <InputAffix
              suffix="%"
              inputMode="decimal"
              value={split}
              onChange={(e) => setSplit(e.target.value)}
              placeholder="50"
            />
          </FormField>
          {(error || generate.isError) && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{error ?? generate.error?.message}</span>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generate.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={generate.isPending}>
              {generate.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Generate draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** IST date + time inputs → ISO instant (UTC). */
const istToIso = (date: string, time: string) => new Date(`${date}T${time || '00:00'}:00+05:30`).toISOString();

export function MarkPaidDialog({
  id,
  payout,
  onOpenChange,
}: {
  id: string;
  payout: string;
  onOpenChange: (o: boolean) => void;
}) {
  const { markPaid } = useSettlementActions(id);
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(todayInIST());
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ref.trim().length < 4) return setError('Enter the bank / UPI reference (at least 4 characters).');
    if (!date) return setError('Enter the payment date.');
    setError(null);
    markPaid.mutate(
      { bankReference: ref.trim(), paidAt: istToIso(date, time || '12:00') },
      {
        onSuccess: () => {
          toast({ title: 'Settlement marked paid', description: `${payout} · ref ${ref.trim()}` });
          onOpenChange(false);
        },
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !markPaid.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Mark as paid</DialogTitle>
            <DialogDescription>
              Record the bank transfer of {payout} to the kitchen partner. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Bank / UPI reference">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} autoComplete="off" className="font-mono" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Paid on">
              <Input type="date" value={date} max={todayInIST()} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Time (IST)" optional>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </FormField>
          </div>
          {(error || markPaid.isError) && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{error ?? markPaid.error?.message}</span>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={markPaid.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={markPaid.isPending}>
              {markPaid.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Mark paid
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
