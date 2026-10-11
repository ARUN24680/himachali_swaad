'use client';

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@pk/ui';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Confirmation for a consequential action (cancel order …). Bottom sheet on phones. The confirm
 * button shows progress and the dialog can't be dismissed while the action runs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Keep it',
  tone = 'destructive',
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'destructive' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  /** Extra content, e.g. a reason field. */
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent layout="sheet" closeLabel={busy ? null : 'Close'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone} disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
