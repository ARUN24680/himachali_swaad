import { formatINR, type AdminOrderDetail } from '@pk/shared';
import {
  Alert,
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@pk/ui';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquareText,
  Printer,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorState } from '@/components/common/StateBlocks';
import { formatDateTimeFull } from '@/lib/dates';
import { openSignedUrl } from '@/services/api/download';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { ordersApi } from '../api/ordersApi';
import { useAdminOrder, useOrderActions } from '../hooks/useOrders';
import {
  CancelOrderDialog,
  RefundDialog,
  ResendDialog,
  ResolveIssueDialog,
  RetryShipmentDialog,
} from './OrderActionDialogs';
import {
  CustomerBlock,
  DetailBlock,
  ItemsBlock,
  NotificationsBlock,
  OrderTimeline,
  PaymentsBlock,
  ShipmentBlock,
  StatusLogBlock,
} from './OrderSections';

type DialogKind = 'cancel' | 'refund' | 'resend' | 'resolve' | 'retry';

/**
 * Order detail drawer (Phase 9 §9.4). Opened from a row or deep-linked at /orders/:orderCode.
 * Actions appear only when `detail.actions` allows them; the API re-checks every one (409 on an
 * illegal transition) and audits it.
 */
export function OrderDetailDrawer({ orderCode, onClose }: { orderCode: string | undefined; onClose: () => void }) {
  const detail = useAdminOrder(orderCode);
  return (
    <Sheet open={Boolean(orderCode)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-2xl" aria-describedby={undefined}>
        {detail.isPending ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{orderCode}</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <div role="status" aria-label="Loading order" className="grid gap-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            </SheetBody>
          </>
        ) : detail.isError ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono">{orderCode}</SheetTitle>
            </SheetHeader>
            <SheetBody>
              <ErrorState
                title={
                  isApiError(detail.error) && detail.error.status === 404
                    ? 'Order not found'
                    : 'Couldn’t load this order'
                }
                message={detail.error.message}
                onRetry={() => void detail.refetch()}
                retrying={detail.isFetching}
              />
            </SheetBody>
          </>
        ) : (
          <OrderDetailBody d={detail.data} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrderDetailBody({ d }: { d: AdminOrderDetail }) {
  const o = d.order;
  const actions = useOrderActions(o.orderCode);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [docBusy, setDocBusy] = useState<'label' | 'invoice' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);

  const openDoc = async (kind: 'label' | 'invoice') => {
    setDocBusy(kind);
    try {
      const blocked = await openSignedUrl(() =>
        kind === 'label' ? ordersApi.label(o.orderCode) : ordersApi.invoice(o.orderCode),
      );
      if (blocked)
        toast({
          title: 'Pop-up blocked',
          description: 'Allow pop-ups for this site, then try again.',
          tone: 'neutral',
        });
    } catch (err) {
      toast({ title: `Couldn’t open the ${kind}`, description: (err as Error).message, tone: 'destructive' });
    } finally {
      setDocBusy(null);
    }
  };

  const can = d.actions;
  return (
    <>
      <SheetHeader>
        <SheetTitle className="font-mono">{o.orderCode}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} kind="order" />
          <StatusBadge status={o.paymentStatus} />
          <span className="tabular-nums">
            {formatINR(o.totalPaise)} · {formatDateTimeFull(o.createdAt)}
          </span>
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="grid content-start gap-5">
        {o.opsIssue && (
          <Alert tone="warning">
            <AlertTriangle aria-hidden="true" />
            <span>
              <span className="font-semibold">Needs attention:</span> {o.opsIssue}
            </span>
          </Alert>
        )}
        {o.cancelReason && (
          <Alert tone="neutral">
            <Ban aria-hidden="true" />
            <span>Cancelled — {o.cancelReason}</span>
          </Alert>
        )}

        <section aria-label="Order actions" className="flex flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          {can.canResolveIssue && (
            <Button variant="secondary" onClick={() => setDialog('resolve')}>
              <CheckCircle2 aria-hidden="true" />
              Resolve issue
            </Button>
          )}
          {can.canRetryShipment && (
            <Button variant="secondary" onClick={() => setDialog('retry')}>
              <RotateCw aria-hidden="true" />
              Retry booking
            </Button>
          )}
          {can.canRefund && (
            <Button variant="outline" onClick={() => setDialog('refund')}>
              <Undo2 aria-hidden="true" />
              Refund
            </Button>
          )}
          <Button variant="outline" onClick={() => setDialog('resend')}>
            <MessageSquareText aria-hidden="true" />
            Resend message
          </Button>
          {d.shipment?.labelAvailable && (
            <Button variant="outline" onClick={() => void openDoc('label')} disabled={docBusy === 'label'}>
              {docBusy === 'label' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Printer aria-hidden="true" />
              )}
              Label
            </Button>
          )}
          {o.invoiceAvailable && (
            <Button variant="outline" onClick={() => void openDoc('invoice')} disabled={docBusy === 'invoice'}>
              {docBusy === 'invoice' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <FileText aria-hidden="true" />
              )}
              Invoice
            </Button>
          )}
          {can.canCancel && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setDialog('cancel')}
            >
              <Ban aria-hidden="true" />
              Cancel order
            </Button>
          )}
        </section>

        <Tabs defaultValue="overview" className="grid gap-4">
          <TabsList aria-label="Order sections" className="-mx-1 px-1 pb-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="money">Payments</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="activity">Notes · messages</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="grid gap-6">
            <CustomerBlock d={d} />
            <ItemsBlock d={d} />
          </TabsContent>
          <TabsContent value="timeline" className="grid gap-6">
            <DetailBlock title="Timeline">
              <OrderTimeline entries={d.timeline} />
            </DetailBlock>
            <StatusLogBlock d={d} />
          </TabsContent>
          <TabsContent value="money" className="grid gap-6">
            <PaymentsBlock d={d} />
          </TabsContent>
          <TabsContent value="shipping" className="grid gap-6">
            <ShipmentBlock d={d} />
          </TabsContent>
          <TabsContent value="activity" className="grid gap-6">
            <NotesBlock d={d} actions={actions} />
            <NotificationsBlock d={d} />
          </TabsContent>
        </Tabs>
      </SheetBody>

      {dialog === 'cancel' && <CancelOrderDialog d={d} actions={actions} onOpenChange={close} />}
      {dialog === 'refund' && <RefundDialog d={d} actions={actions} onOpenChange={close} />}
      {dialog === 'resend' && <ResendDialog d={d} actions={actions} onOpenChange={close} />}
      {dialog === 'resolve' && <ResolveIssueDialog d={d} actions={actions} onOpenChange={close} />}
      {dialog === 'retry' && <RetryShipmentDialog d={d} actions={actions} onOpenChange={close} />}
    </>
  );
}

function NotesBlock({ d, actions }: { d: AdminOrderDetail; actions: ReturnType<typeof useOrderActions> }) {
  const [text, setText] = useState('');
  const m = actions.addNote;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    m.mutate(text.trim(), {
      onSuccess: () => {
        setText('');
        toast({ title: 'Note added' });
      },
    });
  };
  return (
    <DetailBlock title="Internal notes">
      {d.notes.length > 0 && (
        <ul className="grid gap-2">
          {d.notes.map((n) => (
            <li key={`${n.at}-${n.text}`} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <p className="whitespace-pre-line">{n.text}</p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {n.by ?? 'System'} · {formatDateTimeFull(n.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="grid gap-2">
        <label htmlFor="order-note" className="sr-only">
          New note
        </label>
        <Textarea
          id="order-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Add a note for the team (not visible to the customer)"
        />
        {m.isError && <p className="text-xs font-medium text-destructive">{m.error.message}</p>}
        <Button type="submit" variant="outline" className="justify-self-end" disabled={!text.trim() || m.isPending}>
          {m.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Add note
        </Button>
      </form>
    </DetailBlock>
  );
}
