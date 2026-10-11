'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none!',
        className,
      )}
      {...props}
    />
  );
}

export const dialogContentVariants = cva(
  'fixed z-50 grid w-full gap-4 border border-border bg-card text-card-foreground shadow-float outline-none motion-reduce:animate-none!',
  {
    variants: {
      layout: {
        /** Centered dialog at every size. */
        center:
          'top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg p-6 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-md',
        /** Bottom sheet on phones (< 640px, thumb reach — Rules §1.1), centered dialog from `sm` up. */
        sheet: [
          'inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-2xl border-b-0 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
          'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border-b sm:p-8',
          'sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
        ].join(' '),
      },
    },
    defaultVariants: { layout: 'center' },
  },
);

export interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Content>, VariantProps<typeof dialogContentVariants> {
  /** Accessible label for the close (X) button. Pass `null` to hide it. */
  closeLabel?: string | null;
}

export function DialogContent({ className, children, layout, closeLabel = 'Close', ...props }: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ layout }), className)}
        {...props}
      >
        {layout === 'sheet' && (
          <div aria-hidden="true" className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
        )}
        {children}
        {closeLabel !== null && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:top-3 sm:right-3 [&_svg]:size-5"
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('grid gap-1.5 pr-10', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-serif text-2xl leading-tight font-medium text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
