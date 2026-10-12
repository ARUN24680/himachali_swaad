'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Order code chip with a copy button (code is what support and /track ask for). */
export function OrderCodeChip({ orderCode }: { orderCode: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderCode);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the code is still selectable text
    }
  };
  return (
    <div className="inline-flex w-fit max-w-full items-center gap-1 justify-self-start rounded-lg border border-border bg-card py-1 pr-1 pl-3.5">
      <span className="text-xs tracking-[0.08em] text-muted-foreground uppercase">Order</span>
      <span
        className="font-mono text-lg font-semibold tracking-wider text-foreground select-all"
        data-testid="order-code"
      >
        {orderCode}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Order code copied' : `Copy order code ${orderCode}`}
        className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4.5"
      >
        {copied ? <Check aria-hidden="true" className="text-success" /> : <Copy aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}
