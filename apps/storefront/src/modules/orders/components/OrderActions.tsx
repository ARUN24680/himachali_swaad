'use client';

import { Alert, Button, Textarea } from '@pk/ui';
import { AlertCircle, Download, Loader2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormField, fieldAria } from '@/components/common/FormField';
import { isApiError } from '@/lib/api-client';
import { useCancelOrder, useInvoiceDownload } from '../hooks/useOrderStatus';

/** Signed, 5-minute invoice URL fetched on tap (never stored in the page). */
export function InvoiceButton({ orderCode, phone }: { orderCode: string; phone: string | undefined }) {
  const invoice = useInvoiceDownload(orderCode, phone);
  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" onClick={() => invoice.mutate()} disabled={invoice.isPending}>
        {invoice.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}
        Download invoice
      </Button>
      {invoice.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&rsquo;t fetch the invoice. Please try again.
        </p>
      )}
    </div>
  );
}

/** Customer self-cancel (session owners, CONFIRMED / AWAITING_PACKING only — `canCancel` from the API). */
export function CancelOrderButton({ orderCode }: { orderCode: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const cancel = useCancelOrder(orderCode);
  const id = 'cancel-reason';

  const confirm = () => {
    if (reason.trim().length < 3) {
      setFieldError('Tell us why (a few words is fine)');
      return;
    }
    cancel.mutate(reason.trim(), { onSuccess: () => setOpen(false) });
  };

  const serverError = cancel.error
    ? isApiError(cancel.error, 'ILLEGAL_TRANSITION') || isApiError(cancel.error, 'INVALID_STATE')
      ? 'This order is already being packed and can no longer be cancelled here. Please contact us.'
      : isApiError(cancel.error)
        ? cancel.error.message
        : 'Something went wrong. Please try again.'
    : null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10"
        onClick={() => {
          cancel.reset();
          setOpen(true);
        }}
      >
        <XCircle aria-hidden="true" />
        Cancel order
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancel ${orderCode}?`}
        description="Your jars go back to the batch and the full amount is refunded to your original payment method."
        confirmLabel="Cancel order"
        cancelLabel="Keep my order"
        busy={cancel.isPending}
        onConfirm={confirm}
      >
        <FormField id={id} label="Reason" error={fieldError ?? undefined}>
          <Textarea
            {...fieldAria(id, fieldError ?? undefined, false)}
            value={reason}
            maxLength={300}
            rows={3}
            onChange={(e) => {
              setReason(e.target.value);
              if (fieldError) setFieldError(null);
            }}
          />
        </FormField>
        {serverError && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            <span>{serverError}</span>
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
