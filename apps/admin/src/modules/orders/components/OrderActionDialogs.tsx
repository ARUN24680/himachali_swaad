import { ADMIN_REFUND_REASONS, RESENDABLE_TEMPLATES, formatINR, type AdminOrderDetail } from '@pk/shared';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  SelectItem,
  Textarea,
} from '@pk/ui';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { FormField } from '@/components/common/FormField';
import { SelectControl } from '@/components/common/SelectControl';
import { InputAffix } from '@/components/common/InputAffix';
import { paiseToRupeesInput, rupeesToPaise } from '@/lib/money-input';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import type { useOrderActions } from '../hooks/useOrders';
import { REFUND_REASON_LABEL, TEMPLATE_LABEL } from './orderMeta';

type Actions = ReturnType<typeof useOrderActions>;

const errorText = (err: unknown) =>
  isApiError(err, 'NETWORK_ERROR')
    ? 'Can’t reach the server. Check your connection and try again.'
    : err instanceof Error
      ? err.message
      : 'Something went wrong. Please try again.';

function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  submitLabel,
  submitTone = 'primary',
  onSubmit,
  children,
  submitDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  submitTone?: 'primary' | 'destructive';
  onSubmit: () => void;
  children: ReactNode;
  submitDisabled?: boolean;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent layout="sheet">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          {error ? (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{errorText(error)}</span>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Back
            </Button>
            <Button
              type="submit"
              variant={submitTone === 'destructive' ? 'destructive' : 'primary'}
              disabled={pending || submitDisabled}
            >
              {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DialogProps {
  d: AdminOrderDetail;
  actions: Actions;
  onOpenChange: (o: boolean) => void;
}

/** Cancel (only offered when detail.actions.canCancel — 07 §1.2 allowed map, the API re-checks). */
export function CancelOrderDialog({ d, actions, onOpenChange }: DialogProps) {
  const [reason, setReason] = useState('');
  const [refund, setRefund] = useState(true);
  const [touched, setTouched] = useState(false);
  const refundId = useId();
  const paid = d.refundablePaise > 0;
  const tooShort = reason.trim().length < 3;
  const m = actions.cancel;
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={`Cancel ${d.order.orderCode}?`}
      description="Reserved jars go back to stock and the customer is told on WhatsApp / SMS."
      pending={m.isPending}
      error={m.error}
      submitLabel="Cancel order"
      submitTone="destructive"
      onSubmit={() => {
        setTouched(true);
        if (tooShort) return;
        m.mutate(
          { reason: reason.trim(), refund: paid ? refund : false },
          {
            onSuccess: () => {
              toast({
                title: `${d.order.orderCode} cancelled`,
                description: paid && refund ? 'Full refund started.' : undefined,
              });
              onOpenChange(false);
            },
          },
        );
      }}
    >
      <FormField
        label="Reason"
        hint="Shown in the status log and audit trail."
        error={touched && tooShort ? 'Write at least 3 characters' : undefined}
      >
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
      </FormField>
      {paid && (
        <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
          <Checkbox id={refundId} checked={refund} onCheckedChange={(c) => setRefund(c === true)} className="mt-0.5" />
          <Label htmlFor={refundId} className="grid gap-0.5 font-normal">
            <span className="font-medium">Refund {formatINR(d.refundablePaise)} to the customer</span>
            <span className="text-xs text-muted-foreground">
              Goes back to the original payment method via Razorpay.
            </span>
          </Label>
        </div>
      )}
    </ActionDialog>
  );
}

/**
 * Full / partial refund. One Idempotency-Key per dialog opening (reused on retry), so a double tap
 * or a retried request can never refund twice. Amount entered in ₹, sent in paise.
 */
export function RefundDialog({ d, actions, onOpenChange }: DialogProps) {
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(paiseToRupeesInput(d.refundablePaise));
  const [reason, setReason] = useState<(typeof ADMIN_REFUND_REASONS)[number] | ''>('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const paise = rupeesToPaise(amount);
  const amountError =
    paise == null || paise <= 0
      ? 'Enter an amount in rupees, e.g. 120 or 120.50'
      : paise > d.refundablePaise
        ? `Can’t refund more than ${formatINR(d.refundablePaise)} (what’s left of the payment)`
        : undefined;
  const reasonError = reason ? undefined : 'Pick a reason';
  const notesError = notes.trim().length < 3 ? 'Write at least 3 characters' : undefined;
  const m = actions.refund;
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title={`Refund ${d.order.orderCode}`}
      description={`Up to ${formatINR(d.refundablePaise)} can still be refunded. Razorpay usually settles in 5–7 working days.`}
      pending={m.isPending}
      error={m.error}
      submitLabel={paise && !amountError ? `Refund ${formatINR(paise)}` : 'Refund'}
      submitDisabled={touched && Boolean(amountError)}
      onSubmit={() => {
        setTouched(true);
        if (amountError || reasonError || notesError || paise == null || !reason) return;
        m.mutate(
          { body: { amountPaise: paise, reason, notes: notes.trim() }, key },
          {
            onSuccess: () => {
              toast({ title: `Refund of ${formatINR(paise)} started`, description: d.order.orderCode });
              onOpenChange(false);
            },
          },
        );
      }}
    >
      <FormField
        label="Amount"
        error={touched || (paise != null && paise > d.refundablePaise) ? amountError : undefined}
        aside={
          <button
            type="button"
            className="text-xs font-medium text-accent-foreground underline-offset-4 hover:underline"
            onClick={() => setAmount(paiseToRupeesInput(d.refundablePaise))}
          >
            Full amount
          </button>
        }
      >
        <InputAffix prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <FormField label="Reason" error={touched ? reasonError : undefined}>
        <SelectControl
          value={reason}
          onValueChange={(v) => setReason(v as typeof reason)}
          placeholder="Choose a reason"
        >
          {ADMIN_REFUND_REASONS.map((r) => (
            <SelectItem key={r} value={r}>
              {REFUND_REASON_LABEL[r]}
            </SelectItem>
          ))}
        </SelectControl>
      </FormField>
      <FormField
        label="Notes"
        hint="For the audit log and the settlement statement."
        error={touched ? notesError : undefined}
      >
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300} />
      </FormField>
    </ActionDialog>
  );
}

export function ResendDialog({ d, actions, onOpenChange }: DialogProps) {
  const [template, setTemplate] = useState<(typeof RESENDABLE_TEMPLATES)[number] | ''>('');
  const [touched, setTouched] = useState(false);
  const m = actions.resend;
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Resend a message"
      description={`Sends again on WhatsApp (SMS fallback for critical updates) to ${d.customer.name}.`}
      pending={m.isPending}
      error={m.error}
      submitLabel="Send"
      onSubmit={() => {
        setTouched(true);
        if (!template) return;
        m.mutate(template, {
          onSuccess: (r) => {
            toast({ title: 'Message queued', description: r.message });
            onOpenChange(false);
          },
        });
      }}
    >
      <FormField label="Message" error={touched && !template ? 'Pick a message' : undefined}>
        <SelectControl
          value={template}
          onValueChange={(v) => setTemplate(v as typeof template)}
          placeholder="Choose a message"
        >
          {RESENDABLE_TEMPLATES.map((t) => (
            <SelectItem key={t} value={t}>
              {TEMPLATE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectControl>
      </FormField>
    </ActionDialog>
  );
}

export function ResolveIssueDialog({ d, actions, onOpenChange }: DialogProps) {
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const short = note.trim().length < 3;
  const m = actions.resolveIssue;
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Mark issue resolved"
      description={d.order.opsIssue ? `Current issue: ${d.order.opsIssue}` : 'Clears the ops flag on this order.'}
      pending={m.isPending}
      error={m.error}
      submitLabel="Resolve"
      onSubmit={() => {
        setTouched(true);
        if (short) return;
        m.mutate(note.trim(), {
          onSuccess: () => {
            toast({ title: 'Issue resolved', description: d.order.orderCode });
            onOpenChange(false);
          },
        });
      }}
    >
      <FormField label="What was done?" error={touched && short ? 'Write at least 3 characters' : undefined}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
      </FormField>
    </ActionDialog>
  );
}

export function RetryShipmentDialog({ d, actions, onOpenChange }: DialogProps) {
  const m = actions.retryShipment;
  return (
    <ActionDialog
      open
      onOpenChange={onOpenChange}
      title="Retry shipment booking?"
      description={`Books ${d.order.orderCode} with Shiprocket again (attempt ${(d.shipment?.bookingAttempts ?? 0) + 1}). Check the wallet balance first if the last error was about funds.`}
      pending={m.isPending}
      error={m.error}
      submitLabel="Retry booking"
      onSubmit={() =>
        m.mutate(undefined, {
          onSuccess: (r) => {
            toast({ title: 'Booking retried', description: r.message });
            onOpenChange(false);
          },
        })
      }
    >
      {d.shipment?.lastError && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Last error: {d.shipment.lastError}
        </p>
      )}
    </ActionDialog>
  );
}
