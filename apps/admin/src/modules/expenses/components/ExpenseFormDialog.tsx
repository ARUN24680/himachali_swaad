import { EXPENSE_CATEGORIES, ExpenseCreateRequestSchema, todayInIST, type ExpenseRow, type StaffRow } from '@pk/shared';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectItem,
  Textarea,
} from '@pk/ui';
import { AlertCircle, Loader2, Paperclip } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FormField } from '@/components/common/FormField';
import { SelectControl } from '@/components/common/SelectControl';
import { InputAffix } from '@/components/common/InputAffix';
import { paiseToRupeesInput, rupeesToPaise } from '@/lib/money-input';
import { toast } from '@/store/toast.store';
import { RECEIPT_MAX_BYTES } from '../api/expensesApi';
import { useSaveExpense } from '../hooks/useExpenses';
import { CATEGORY_LABEL, type ExpenseCategory } from './expenseMeta';

const BUSINESS = 'business';

/** Add / edit an expense, optionally with a receipt (PDF or photo, ≤ 5 MB, private storage). */
export function ExpenseFormDialog({
  expense,
  staff,
  onOpenChange,
}: {
  expense: ExpenseRow | null;
  staff: StaffRow[] | undefined;
  onOpenChange: (o: boolean) => void;
}) {
  const save = useSaveExpense();
  const [category, setCategory] = useState<ExpenseCategory | ''>(expense?.category ?? '');
  const [amount, setAmount] = useState(paiseToRupeesInput(expense?.amountPaise));
  const [incurredOn, setIncurredOn] = useState(expense?.incurredOn ?? todayInIST());
  const [description, setDescription] = useState(expense?.description ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.id ?? BUSINESS);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountPaise = rupeesToPaise(amount);
    const r = ExpenseCreateRequestSchema.safeParse({
      category: category || undefined,
      amountPaise: amountPaise ?? undefined,
      incurredOn,
      description: description.trim(),
      paidById: paidBy === BUSINESS ? null : paidBy,
    });
    const errs: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    if (!category) errs.category = 'Pick a category';
    if (amountPaise == null || amountPaise <= 0) errs.amountPaise = 'Enter an amount in rupees, e.g. 4999 or 499.50';
    if (description.trim().length < 3) errs.description = 'Describe it in a few words';
    if (receipt && receipt.size > RECEIPT_MAX_BYTES) errs.receipt = 'Receipts can be at most 5 MB';
    setErrors(errs);
    if (!r.success || Object.keys(errs).length) return;
    save.mutate(
      { id: expense?.id, body: r.data, receipt },
      {
        onSuccess: () => {
          toast({ title: expense ? 'Expense updated' : 'Expense added', description: CATEGORY_LABEL[r.data.category] });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent layout="sheet" className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{expense ? 'Edit expense' : 'Add an expense'}</DialogTitle>
            <DialogDescription>
              Shared costs (ads, software, compliance…) come off the profit pool in the settlement for their period.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Category" error={errors.category}>
              <SelectControl
                value={category}
                onValueChange={(v) => setCategory(v as ExpenseCategory)}
                placeholder="Choose"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectControl>
            </FormField>
            <FormField label="Amount" error={errors.amountPaise}>
              <InputAffix prefix="₹" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </FormField>
            <FormField label="Date" error={errors.incurredOn}>
              <Input
                type="date"
                value={incurredOn}
                max={todayInIST()}
                onChange={(e) => setIncurredOn(e.target.value)}
              />
            </FormField>
            <FormField label="Paid by" hint="A kitchen partner’s out-of-pocket cost is paid back in their settlement">
              <SelectControl value={paidBy} onValueChange={setPaidBy}>
                <SelectItem value={BUSINESS}>Business account</SelectItem>
                {staff
                  ?.filter((s) => s.isActive || s.id === expense?.paidBy?.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName ?? s.email}
                    </SelectItem>
                  ))}
              </SelectControl>
            </FormField>
          </div>
          <FormField label="Description" error={errors.description}>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </FormField>
          <FormField
            label={expense?.receiptAvailable ? 'Replace receipt' : 'Receipt'}
            optional
            hint="PDF, JPG, PNG or WebP · up to 5 MB · stored privately"
            error={errors.receipt}
          >
            <Input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground"
            />
          </FormField>
          {receipt && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Paperclip aria-hidden="true" className="size-3.5" />
              {receipt.name}
            </p>
          )}
          {save.isError && (
            <Alert tone="destructive">
              <AlertCircle aria-hidden="true" />
              <span>{save.error.message}</span>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {expense ? 'Save changes' : 'Add expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
