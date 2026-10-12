import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pk/ui';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/** Yes/no confirmation for a consequential action (finalize, delete, replay…). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  error,
  tone = 'primary',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  error?: string | null;
  tone?: 'primary' | 'destructive';
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent layout="sheet">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {error && (
          <Alert tone="destructive">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={tone === 'destructive' ? 'destructive' : 'primary'} onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
