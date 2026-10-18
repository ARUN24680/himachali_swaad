import { Button, cn } from '@pk/ui';
import { Check, Copy } from 'lucide-react';
import { useCopy } from '../hooks/useCopy';

interface CopyButtonProps {
  value: string;
  /** What is being copied, e.g. "amount" → aria-label "Copy amount". */
  label: string;
  className?: string;
}

/** Icon button (44 px target) that copies `value` and confirms politely to screen readers. */
export function CopyButton({ value, label, className }: CopyButtonProps) {
  const { copied, failed, copy } = useCopy();
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={() => void copy(value)}
        className={cn(copied && 'text-success')}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : failed ? `Couldn't copy ${label}` : ''}
      </span>
    </span>
  );
}
