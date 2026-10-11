'use client';

import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '../lib/utils';
import { DialogOverlay } from './dialog';

/**
 * Side drawer (desktop/tablet) that becomes a bottom sheet on phones (< 640px, Rules §1.1).
 * Built on the Radix Dialog primitive — focus trap, Esc and scroll lock come for free.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  closeLabel?: string | null;
}

export function SheetContent({ className, children, closeLabel = 'Close', ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col border-border bg-card text-card-foreground shadow-float outline-none motion-reduce:animate-none!',
          // Phone: bottom sheet
          'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)]',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom',
          // sm+: right drawer
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:max-h-none sm:w-full sm:max-w-lg sm:rounded-none sm:border-t-0 sm:border-l',
          'sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:slide-out-to-right sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        {/* Close first in DOM order: it takes initial focus, so a form field inside never pops the phone keyboard */}
        {closeLabel !== null && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:top-3 sm:right-3 [&_svg]:size-5"
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
        <div aria-hidden="true" className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('grid gap-1.5 border-b border-border px-5 pt-3 pr-14 pb-4 sm:px-6 sm:pt-6', className)}
      {...props}
    />
  );
}

export function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6', className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6',
        className,
      )}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-serif text-xl leading-tight font-medium text-foreground', className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
