'use client';

import { XIcon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../lib/utils';

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        // Above the mobile bottom nav; bottom-right on larger screens
        'fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4 outline-none md:right-4 md:bottom-4 md:left-auto md:mx-0 md:px-0',
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  'pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-card py-3 pr-12 pl-4 text-sm text-card-foreground shadow-float data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[swipe=end]:animate-out data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) motion-reduce:animate-none! [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        success: 'border-success/40 [&>svg]:text-success',
        destructive: 'border-destructive/40 [&>svg]:text-destructive',
        neutral: 'border-border [&>svg]:text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface ToastProps
  extends React.ComponentProps<typeof ToastPrimitive.Root>, VariantProps<typeof toastVariants> {}

export function Toast({ className, tone, ...props }: ToastProps) {
  return <ToastPrimitive.Root data-slot="toast" className={cn(toastVariants({ tone }), className)} {...props} />;
}

export function ToastTitle({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title data-slot="toast-title" className={cn('font-medium', className)} {...props} />;
}

export function ToastDescription({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  );
}

export function ToastClose({ className, ...props }: React.ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Dismiss"
      className={cn(
        'absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4',
        className,
      )}
      {...props}
    >
      <XIcon />
    </ToastPrimitive.Close>
  );
}
