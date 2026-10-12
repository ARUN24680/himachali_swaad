import { Select, SelectContent, SelectTrigger, SelectValue } from '@pk/ui';
import type { ReactNode } from 'react';

/**
 * Radix Select wired for <FormField>: the field's id / aria-invalid / aria-describedby land on the
 * trigger button (the Select root renders no element), so the <label> names the combobox.
 */
export function SelectControl({
  value,
  onValueChange,
  placeholder,
  children,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  children: ReactNode;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-invalid={ariaInvalid} aria-describedby={ariaDescribedBy}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
