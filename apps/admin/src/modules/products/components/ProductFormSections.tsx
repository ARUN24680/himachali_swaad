import { MeatTypeEnum } from '@pk/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  RadioCard,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from '@pk/ui';
import { Flame, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { FormField } from '@/components/common/FormField';
import { InputAffix } from '@/components/common/InputAffix';
import { MEAT_LABEL } from './productMeta';
import { NUTRITION_FIELDS, type FieldErrors, type ProductFormValues } from './productForm';

export interface SectionProps {
  values: ProductFormValues;
  errors: FieldErrors;
  set: <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => void;
  mode: 'create' | 'edit';
}

export function FormSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-5">{children}</CardContent>
    </Card>
  );
}

const numeric = { inputMode: 'numeric' as const, autoComplete: 'off' };
const decimal = { inputMode: 'decimal' as const, autoComplete: 'off' };

export function BasicsSection({ values, errors, set, mode }: SectionProps) {
  return (
    <FormSection
      id="basics"
      title="Basics"
      description="What customers see first. The non-veg mark is added automatically on every listing."
    >
      <FormField label="Product name" error={errors.title}>
        <Input
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="e.g. Himachali Chicken Pickle"
          maxLength={150}
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="SKU"
          error={errors.sku}
          hint={
            mode === 'edit'
              ? 'Locked — batch codes include it.'
              : 'Capitals and digits, e.g. CHK250. Can’t be changed later.'
          }
          aside={mode === 'edit' ? <Lock aria-hidden="true" className="size-3.5 text-muted-foreground" /> : undefined}
        >
          <Input
            value={values.sku}
            onChange={(e) => set('sku', e.target.value.toUpperCase())}
            readOnly={mode === 'edit'}
            className={cn('font-mono uppercase', mode === 'edit' && 'bg-muted')}
            maxLength={20}
            autoCapitalize="characters"
            placeholder="e.g. CHK250"
          />
        </FormField>
        <FormField label="Meat" error={errors.meatType}>
          <Select value={values.meatType} onValueChange={(v) => set('meatType', v as ProductFormValues['meatType'])}>
            <SelectTrigger aria-label="Meat">
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {MeatTypeEnum.options.map((m) => (
                <SelectItem key={m} value={m}>
                  {MEAT_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Product group"
          error={errors.productGroup}
          hint="Same group = size variants of one pickle (250 g ↔ 500 g)."
        >
          <Input
            value={values.productGroup}
            onChange={(e) => set('productGroup', e.target.value)}
            placeholder="himachali-chicken-pickle"
          />
        </FormField>
        <FormField label="Net weight" error={errors.netWeightG}>
          <InputAffix
            suffix="g"
            {...numeric}
            value={values.netWeightG}
            onChange={(e) => set('netWeightG', e.target.value)}
          />
        </FormField>
      </div>
      <FormField
        label="URL slug"
        error={errors.slug}
        hint={values.slug ? `pahadikhatki.in/products/${values.slug}` : 'Filled from the name — edit if needed.'}
      >
        <Input
          value={values.slug}
          onChange={(e) => set('slug', e.target.value)}
          placeholder="himachali-chicken-pickle-250g"
        />
      </FormField>
      <FormField
        label="Short description"
        optional
        error={errors.shortDescription}
        aside={<Counter value={values.shortDescription} max={300} />}
      >
        <Input
          value={values.shortDescription}
          onChange={(e) => set('shortDescription', e.target.value)}
          maxLength={300}
          placeholder="e.g. Slow-cooked in cold-pressed mustard oil"
        />
      </FormField>
      <FormField
        label="Description"
        error={errors.description}
        aside={<Counter value={values.description} max={5000} />}
      >
        <Textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={5}
          maxLength={5000}
        />
      </FormField>
    </FormSection>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {value.length}/{max}
    </span>
  );
}

export function PricingSection({ values, errors, set }: SectionProps) {
  return (
    <FormSection
      id="pricing"
      title="Pricing & tax"
      description="Prices are MRP inclusive of all taxes (D-26). GST is still pending CA confirmation (Q-01)."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Price (MRP incl. GST)" error={errors.price}>
          <InputAffix
            prefix="₹"
            {...decimal}
            value={values.price}
            onChange={(e) => set('price', e.target.value)}
            placeholder="e.g. 399"
          />
        </FormField>
        <FormField
          label="Compare-at price"
          optional
          error={errors.comparePrice}
          hint="Shown struck through. Must be above the price."
        >
          <InputAffix
            prefix="₹"
            {...decimal}
            value={values.comparePrice}
            onChange={(e) => set('comparePrice', e.target.value)}
            placeholder="e.g. 449"
          />
        </FormField>
        <FormField label="GST rate" error={errors.gstPercent} hint="Required to publish.">
          <InputAffix
            suffix="%"
            {...decimal}
            value={values.gstPercent}
            onChange={(e) => set('gstPercent', e.target.value)}
            placeholder="e.g. 5"
          />
        </FormField>
        <FormField label="HSN code" error={errors.hsnCode}>
          <Input
            {...numeric}
            value={values.hsnCode}
            onChange={(e) => set('hsnCode', e.target.value)}
            maxLength={8}
            className="tabular-nums"
          />
        </FormField>
      </div>
    </FormSection>
  );
}

const SPICE = ['1', '2', '3', '4', '5'] as const;
const SPICE_LABEL: Record<(typeof SPICE)[number], string> = {
  '1': 'Mild',
  '2': 'Gentle',
  '3': 'Medium',
  '4': 'Hot',
  '5': 'Fiery',
};

export function FoodSafetySection({ values, errors, set }: SectionProps) {
  return (
    <FormSection
      id="food-safety"
      title="Food safety & label"
      description="FSSAI label data. Shelf life comes from the lab report (Q-07) — batches can’t be logged until it’s set."
    >
      <FormField
        label="Ingredients"
        error={errors.ingredients}
        hint="In descending order of weight, as printed on the jar."
      >
        <Textarea
          value={values.ingredients}
          onChange={(e) => set('ingredients', e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Chicken (60%), mustard oil, garlic, red chilli, salt, spices"
        />
      </FormField>
      <FormField label="Allergens" optional error={errors.allergens}>
        <Input
          value={values.allergens}
          onChange={(e) => set('allergens', e.target.value)}
          maxLength={500}
          placeholder="e.g. Mustard"
        />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Shelf life"
          error={errors.shelfLifeDays}
          hint="Days from manufacture. Sets every batch’s expiry."
        >
          <InputAffix
            suffix="days"
            {...numeric}
            value={values.shelfLifeDays}
            onChange={(e) => set('shelfLifeDays', e.target.value)}
            placeholder="e.g. 180"
          />
        </FormField>
        <FormField label="Storage instructions" optional error={errors.storageInstructions}>
          <Input
            value={values.storageInstructions}
            onChange={(e) => set('storageInstructions', e.target.value)}
            placeholder="e.g. Refrigerate after opening"
          />
        </FormField>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">
          Spice level <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <RadioGroup
          value={values.spiceLevel}
          onValueChange={(v) => set('spiceLevel', v)}
          className="grid grid-cols-3 gap-2 sm:grid-cols-6"
          aria-label="Spice level"
        >
          {SPICE.map((level) => (
            <RadioCard key={level} value={level} className="justify-center gap-1.5 px-2">
              <span className="flex" aria-hidden="true">
                {Array.from({ length: Number(level) }, (_, i) => (
                  <Flame key={i} className="-mx-0.5 size-3.5 text-tertiary" />
                ))}
              </span>
              <span className="text-xs">{SPICE_LABEL[level]}</span>
            </RadioCard>
          ))}
          <RadioCard value="" className="justify-center px-2 text-xs text-muted-foreground">
            Not set
          </RadioCard>
        </RadioGroup>
      </fieldset>

      <fieldset className="grid gap-3" aria-describedby="nutrition-hint">
        <legend className="mb-1 text-sm font-medium">Nutrition per 100 g</legend>
        <p
          id="nutrition-hint"
          className={cn('-mt-1 text-xs', errors.nutrition ? 'font-medium text-destructive' : 'text-muted-foreground')}
        >
          {errors.nutrition ?? 'From the lab report. Fill all six together — required to publish.'}
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NUTRITION_FIELDS.map(({ key, label, unit }) => (
            <FormField key={key} label={label}>
              <InputAffix
                suffix={unit}
                {...decimal}
                value={values.nutrition[key]}
                aria-invalid={errors.nutrition ? true : undefined}
                onChange={(e) => set('nutrition', { ...values.nutrition, [key]: e.target.value })}
              />
            </FormField>
          ))}
        </div>
      </fieldset>
    </FormSection>
  );
}

export function ShippingSection({ values, errors, set }: SectionProps) {
  const net = Number(values.netWeightG);
  return (
    <FormSection
      id="shipping"
      title="Shipping"
      description="Used for courier rates. Standard single-jar box is 15 × 10 × 10 cm (D-33)."
    >
      <FormField
        label="Packed weight"
        error={errors.packedWeightG}
        hint={
          net === 250
            ? 'Jar + box + bubble wrap. Keep a 250 g jar at or under 500 g to stay in the first courier slab (D-34).'
            : 'Jar + box + bubble wrap. Required to publish.'
        }
      >
        <InputAffix
          suffix="g"
          {...numeric}
          value={values.packedWeightG}
          onChange={(e) => set('packedWeightG', e.target.value)}
          placeholder="e.g. 480"
        />
      </FormField>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">Box size</legend>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Length" error={errors.packageLengthCm}>
            <InputAffix
              suffix="cm"
              {...decimal}
              value={values.packageLengthCm}
              onChange={(e) => set('packageLengthCm', e.target.value)}
            />
          </FormField>
          <FormField label="Breadth" error={errors.packageBreadthCm}>
            <InputAffix
              suffix="cm"
              {...decimal}
              value={values.packageBreadthCm}
              onChange={(e) => set('packageBreadthCm', e.target.value)}
            />
          </FormField>
          <FormField label="Height" error={errors.packageHeightCm}>
            <InputAffix
              suffix="cm"
              {...decimal}
              value={values.packageHeightCm}
              onChange={(e) => set('packageHeightCm', e.target.value)}
            />
          </FormField>
        </div>
      </fieldset>
      <FormField
        label="Sort order"
        error={errors.sortOrder}
        hint="Lower numbers show first on the storefront."
        className="sm:max-w-48"
      >
        <Input
          {...numeric}
          value={values.sortOrder}
          onChange={(e) => set('sortOrder', e.target.value)}
          className="tabular-nums"
        />
      </FormField>
    </FormSection>
  );
}
