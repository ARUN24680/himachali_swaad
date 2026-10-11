import {
  ProductCreateRequestSchema,
  ProductUpdateRequestSchema,
  type AdminProduct,
  type MeatType,
  type Nutrition,
  type ProductCreateRequest,
  type ProductUpdateRequest,
} from '@pk/shared';
import { basisPointsToPercentInput, paiseToRupeesInput, percentToBasisPoints, rupeesToPaise } from '@/lib/money-input';

/** Everything the editor holds, as raw input strings. Converted to the API contract only on save. */
export interface ProductFormValues {
  sku: string;
  title: string;
  slug: string;
  productGroup: string;
  meatType: MeatType | '';
  netWeightG: string;
  shortDescription: string;
  description: string;
  price: string;
  comparePrice: string;
  gstPercent: string;
  hsnCode: string;
  ingredients: string;
  allergens: string;
  spiceLevel: string;
  shelfLifeDays: string;
  storageInstructions: string;
  nutrition: Record<keyof Nutrition, string>;
  packedWeightG: string;
  packageLengthCm: string;
  packageBreadthCm: string;
  packageHeightCm: string;
  sortOrder: string;
}

export type FieldName = Exclude<keyof ProductFormValues, 'nutrition'> | 'nutrition';
export type FieldErrors = Partial<Record<FieldName, string>>;

export const NUTRITION_FIELDS: { key: keyof Nutrition; label: string; unit: string }[] = [
  { key: 'energyKcal', label: 'Energy', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatG', label: 'Total fat', unit: 'g' },
  { key: 'carbsG', label: 'Carbohydrate', unit: 'g' },
  { key: 'sugarG', label: 'Total sugars', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
];

const EMPTY_NUTRITION: ProductFormValues['nutrition'] = {
  energyKcal: '',
  proteinG: '',
  fatG: '',
  carbsG: '',
  sugarG: '',
  sodiumMg: '',
};

export const emptyProductForm: ProductFormValues = {
  sku: '',
  title: '',
  slug: '',
  productGroup: '',
  meatType: '',
  netWeightG: '250',
  shortDescription: '',
  description: '',
  price: '',
  comparePrice: '',
  gstPercent: '',
  hsnCode: '2001',
  ingredients: '',
  allergens: '',
  spiceLevel: '',
  shelfLifeDays: '',
  storageInstructions: '',
  nutrition: EMPTY_NUTRITION,
  packedWeightG: '',
  packageLengthCm: '15',
  packageBreadthCm: '10',
  packageHeightCm: '10',
  sortOrder: '0',
};

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function formFromProduct(p: AdminProduct): ProductFormValues {
  return {
    sku: p.sku,
    title: p.title,
    slug: p.slug,
    productGroup: p.productGroup,
    meatType: p.meatType,
    netWeightG: str(p.netWeightG),
    shortDescription: p.shortDescription ?? '',
    description: p.description,
    price: paiseToRupeesInput(p.pricePaise),
    comparePrice: paiseToRupeesInput(p.comparePricePaise),
    gstPercent: basisPointsToPercentInput(p.gstRateBp),
    hsnCode: p.hsnCode,
    ingredients: p.ingredients ?? '',
    allergens: p.allergens ?? '',
    spiceLevel: str(p.spiceLevel),
    shelfLifeDays: str(p.shelfLifeDays),
    storageInstructions: p.storageInstructions ?? '',
    nutrition: p.nutrition
      ? (Object.fromEntries(
          NUTRITION_FIELDS.map(({ key }) => [key, str(p.nutrition?.[key])]),
        ) as ProductFormValues['nutrition'])
      : EMPTY_NUTRITION,
    packedWeightG: str(p.packedWeightG),
    packageLengthCm: str(p.packageLengthCm),
    packageBreadthCm: str(p.packageBreadthCm),
    packageHeightCm: str(p.packageHeightCm),
    sortOrder: str(p.sortOrder),
  };
}

/** "Himachali Chicken Pickle" → "himachali-chicken-pickle" */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const INT = /^\d+$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;

type Parsed = Omit<ProductCreateRequest, 'sku'> & { sku: string };

/** Raw strings → contract body. Format problems are reported here; ranges/rules by the shared Zod schema. */
function parse(v: ProductFormValues): { body: Parsed; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const int = (field: FieldName, raw: string, required: boolean): number | null => {
    const t = raw.trim();
    if (!t) {
      if (required) errors[field] = 'Required';
      return null;
    }
    if (!INT.test(t)) {
      errors[field] = 'Use a whole number';
      return null;
    }
    return Number(t);
  };
  const decimal = (field: FieldName, raw: string): number => {
    const t = raw.trim();
    if (!DECIMAL.test(t)) errors[field] = 'Enter a number';
    return Number(t);
  };
  const text = (raw: string) => (raw.trim() ? raw.trim() : null);

  const pricePaise = rupeesToPaise(v.price);
  if (!v.price.trim()) errors.price = 'Required';
  else if (pricePaise == null) errors.price = 'Enter an amount like 399 or 399.50';

  const comparePricePaise = v.comparePrice.trim() ? rupeesToPaise(v.comparePrice) : null;
  if (v.comparePrice.trim() && comparePricePaise == null) errors.comparePrice = 'Enter an amount like 449';

  const gstRateBp = v.gstPercent.trim() ? percentToBasisPoints(v.gstPercent) : null;
  if (v.gstPercent.trim() && gstRateBp == null) errors.gstPercent = 'Enter a rate like 5 or 12';

  let nutrition: Nutrition | null = null;
  const filled = NUTRITION_FIELDS.filter(({ key }) => v.nutrition[key].trim() !== '');
  if (filled.length === NUTRITION_FIELDS.length) {
    nutrition = Object.fromEntries(
      NUTRITION_FIELDS.map(({ key }) => [key, Number(v.nutrition[key].trim())]),
    ) as Nutrition;
    if (NUTRITION_FIELDS.some(({ key }) => !DECIMAL.test(v.nutrition[key].trim())))
      errors.nutrition = 'Nutrition values must be numbers (per 100 g)';
  } else if (filled.length > 0) {
    errors.nutrition = 'Fill all six nutrition values, or leave them all blank for now';
  }

  const body: Parsed = {
    sku: v.sku.trim().toUpperCase(),
    title: v.title.trim(),
    slug: v.slug.trim(),
    productGroup: v.productGroup.trim(),
    meatType: (v.meatType || undefined) as MeatType,
    netWeightG: int('netWeightG', v.netWeightG, true) ?? 0,
    shortDescription: text(v.shortDescription),
    description: v.description.trim(),
    pricePaise: pricePaise ?? 0,
    comparePricePaise,
    gstRateBp,
    hsnCode: v.hsnCode.trim(),
    ingredients: text(v.ingredients),
    allergens: text(v.allergens),
    spiceLevel: int('spiceLevel', v.spiceLevel, false),
    shelfLifeDays: int('shelfLifeDays', v.shelfLifeDays, false),
    storageInstructions: text(v.storageInstructions),
    nutrition,
    packedWeightG: int('packedWeightG', v.packedWeightG, false),
    packageLengthCm: decimal('packageLengthCm', v.packageLengthCm),
    packageBreadthCm: decimal('packageBreadthCm', v.packageBreadthCm),
    packageHeightCm: decimal('packageHeightCm', v.packageHeightCm),
    sortOrder: int('sortOrder', v.sortOrder, true) ?? 0,
  };
  return { body, errors };
}

const FIELD_FROM_PATH: Record<string, FieldName> = {
  pricePaise: 'price',
  comparePricePaise: 'comparePrice',
  gstRateBp: 'gstPercent',
};

interface ZodIssueLike {
  path: readonly PropertyKey[];
  message: string;
  code?: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
}

/** Turn schema issues into short, human field messages. */
function friendly(issue: ZodIssueLike): string {
  const { code, origin } = issue;
  if (code === 'too_small' && origin === 'string') return 'Required';
  if (code === 'too_big' && origin === 'string') return `Keep it under ${String(issue.maximum)} characters`;
  if (code === 'too_small' && origin === 'number')
    return Number(issue.minimum) === 0 && !issue.inclusive
      ? 'Must be more than 0'
      : `Must be at least ${String(issue.minimum)}`;
  if (code === 'too_big' && origin === 'number') return `Must be ${String(issue.maximum)} or less`;
  if (code === 'invalid_type' || code === 'invalid_value') return 'Required';
  return issue.message;
}

function collectZodErrors(issues: readonly ZodIssueLike[], into: FieldErrors) {
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    const field = (FIELD_FROM_PATH[key] ?? key) as FieldName;
    if (field && !into[field]) into[field] = friendly(issue);
  }
}

export function buildCreateBody(v: ProductFormValues): { body?: ProductCreateRequest; errors: FieldErrors } {
  const { body, errors } = parse(v);
  if (!v.meatType) errors.meatType = 'Choose the meat';
  const result = ProductCreateRequestSchema.safeParse(body);
  if (!result.success) collectZodErrors(result.error.issues, errors);
  return Object.keys(errors).length ? { errors } : { body, errors };
}

/** Only changed fields go in the PATCH (SKU is immutable). Empty object → nothing to save. */
export function buildUpdateBody(
  v: ProductFormValues,
  original: ProductFormValues,
): { body?: ProductUpdateRequest; errors: FieldErrors; unchanged?: boolean } {
  const { body, errors } = parse(v);
  const { body: before } = parse(original);
  const changed = Object.fromEntries(
    Object.entries(body).filter(
      ([k, val]) => k !== 'sku' && JSON.stringify(val) !== JSON.stringify(before[k as keyof Parsed]),
    ),
  ) as ProductUpdateRequest;
  if (Object.keys(changed).length === 0) return { errors: {}, unchanged: true };
  // Validate the full record so cross-field rules (compare > price, packed ≥ net) still apply
  const full = ProductUpdateRequestSchema.safeParse({ ...body, sku: undefined });
  if (!full.success) collectZodErrors(full.error.issues, errors);
  return Object.keys(errors).length ? { errors } : { body: changed, errors };
}
