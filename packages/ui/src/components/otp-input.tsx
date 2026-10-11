'use client';

import { useEffect, useRef } from 'react';
import type * as React from 'react';
import { cn } from '../lib/utils';

const GRID_COLS: Record<number, string> = { 4: 'grid-cols-4', 6: 'grid-cols-6', 8: 'grid-cols-8' };

export interface OtpInputProps {
  /** Digits entered so far (contiguous, 0..length chars). */
  value: string;
  onChange: (value: string) => void;
  /** Fired once when the last box is filled (typed, pasted or SMS-autofilled). */
  onComplete?: (value: string) => void;
  length?: number;
  /** Accessible name for the group, e.g. "Verification code". */
  label: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * N single-digit boxes for OTP / TOTP codes.
 * - Box 1 carries autocomplete="one-time-code" so iOS/Android SMS autofill lands there; any multi-digit
 *   input (autofill or paste) is spread across the boxes.
 * - Typing auto-advances; Backspace on an empty box steps back; arrows move between boxes.
 * - Value is always contiguous: focusing past the first empty box jumps back to it.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  label,
  id,
  disabled,
  invalid,
  autoFocus,
  className,
  'aria-describedby': describedBy,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Latest value, updated synchronously on every edit: focus moves before the parent re-renders,
  // so the focus guard must not read the (stale) prop.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  // Boxes are disabled while a code is being checked, which drops focus. When they re-enable
  // (e.g. a wrong code was cleared) put the caret back so the user can just retype.
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled && autoFocus) {
      refs.current[Math.min(latest.current.length, length - 1)]?.focus();
    }
    wasDisabled.current = disabled;
  }, [disabled, autoFocus, length]);

  const focusBox = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    const wasComplete = latest.current.length === length;
    latest.current = clean;
    onChange(clean);
    if (clean.length === length && !wasComplete) onComplete?.(clean);
    return clean;
  };

  const handleChange = (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const value = latest.current;
    let digits = e.target.value.replace(/\D/g, '');
    // Mobile keyboards may not honour select(): "5" + typed "7" arrives as "57" — keep only the new digit
    if (digits.length === 2 && value[i] && digits.startsWith(value[i])) digits = digits.slice(1);

    if (!digits) {
      commit(value.slice(0, i) + value.slice(i + 1));
      return;
    }
    if (digits.length > 1) {
      // Paste / SMS autofill: a full code replaces everything, a partial one fills from this box
      const clean = commit(digits.length >= length ? digits : value.slice(0, i) + digits);
      focusBox(clean.length);
      return;
    }
    const clean = commit(value.slice(0, i) + digits + value.slice(i + 1));
    focusBox(Math.min(i + 1, clean.length));
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const value = latest.current;
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      e.preventDefault();
      commit(value.slice(0, i - 1));
      focusBox(i - 1);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight' && i < value.length) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };

  const handleFocus = (i: number, e: React.FocusEvent<HTMLInputElement>) => {
    if (i > latest.current.length) {
      focusBox(latest.current.length);
      return;
    }
    e.target.select();
  };

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      data-slot="otp-input"
      className={cn('grid gap-2 sm:gap-3', GRID_COLS[length] ?? 'grid-cols-6', className)}
    >
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          // Focus moves straight to the code the user just requested
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => handleFocus(i, e)}
          className={cn(
            'h-13 w-full min-w-0 rounded-lg border border-input bg-background text-center font-sans text-xl font-semibold text-foreground tabular-nums caret-ring transition-[border-color,box-shadow] outline-none sm:h-14 sm:text-2xl',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
            value[i] && 'border-foreground/40',
          )}
        />
      ))}
    </div>
  );
}
