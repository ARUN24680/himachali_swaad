import { formatINR } from '@pk/shared/money';

export { formatINR };

/** 49937 → "499.37" — plain number for pasting into a UPI app's amount field (integer maths only). */
export function paiseToPlain(paise: number): string {
  const rupees = Math.floor(paise / 100);
  return `${rupees}.${String(paise % 100).padStart(2, '0')}`;
}

/** Remaining ms → "14:05" or "1:02:09". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Remaining ms → "14 minutes 5 seconds" for screen readers. */
export function describeCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}
