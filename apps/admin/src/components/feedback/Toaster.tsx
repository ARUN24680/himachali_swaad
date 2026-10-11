import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@pk/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToastStore } from '@/store/toast.store';

/** Renders transient confirmations ("Batch PK-2610-CHK250-01 logged"). Mounted once in the shell. */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <ToastProvider swipeDirection="down" duration={5000}>
      {toasts.map((t) => (
        <Toast key={t.id} tone={t.tone} onOpenChange={(open) => !open && dismiss(t.id)}>
          {t.tone === 'destructive' ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
          <div className="grid min-w-0 gap-0.5">
            <ToastTitle>{t.title}</ToastTitle>
            {t.description && <ToastDescription>{t.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
