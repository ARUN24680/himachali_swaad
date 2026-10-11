import type { AdminProduct } from '@pk/shared';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, NonVegMark, Skeleton } from '@pk/ui';
import { ArrowLeft, ImagePlus, Loader2, PackageSearch, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/StateBlocks';
import { isApiError } from '@/services/api/http';
import { toast } from '@/store/toast.store';
import { ImageManager } from '../components/ImageManager';
import {
  buildCreateBody,
  buildUpdateBody,
  emptyProductForm,
  formFromProduct,
  slugify,
  type FieldErrors,
  type ProductFormValues,
} from '../components/productForm';
import {
  BasicsSection,
  FoodSafetySection,
  FormSection,
  PricingSection,
  ShippingSection,
} from '../components/ProductFormSections';
import { PublishPanel } from '../components/PublishPanel';
import { useCreateProduct, useProduct, useUpdateProduct } from '../hooks/useProducts';

const BackLink = () => (
  <Link
    to="/products"
    className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-semibold tracking-[0.12em] uppercase outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
  >
    <ArrowLeft aria-hidden="true" className="size-3.5" />
    Products
  </Link>
);

/** 409 DUPLICATE → which field collided (details.field from the API). */
function duplicateError(err: unknown, v: ProductFormValues): FieldErrors | null {
  if (!isApiError(err, 'DUPLICATE')) return null;
  const field = String(err.details?.field ?? '');
  if (/sku/i.test(field)) return { sku: `SKU ${v.sku} is already used by another product` };
  if (/slug/i.test(field)) return { slug: 'Another product already uses this URL slug' };
  return { netWeightG: `“${v.productGroup}” already has a ${v.netWeightG} g variant` };
}

function SaveBar({
  busy,
  dirty,
  mode,
  error,
}: {
  busy: boolean;
  dirty: boolean;
  mode: 'create' | 'edit';
  error: string | null;
}) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 shadow-float backdrop-blur md:bottom-0 md:mx-0 md:rounded-lg md:border">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p
          role={error ? 'alert' : 'status'}
          className={error ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}
        >
          {error ??
            (mode === 'create'
              ? 'Saved as a draft — hidden until you publish.'
              : dirty
                ? 'You have unsaved changes.'
                : 'All changes saved.')}
        </p>
        <Button type="submit" disabled={busy || (mode === 'edit' && !dirty)} className="sm:min-w-40">
          {busy ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {mode === 'create' ? 'Save draft' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

function ProductEditor({ product }: { product?: AdminProduct }) {
  const mode = product ? 'edit' : 'create';
  const navigate = useNavigate();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const [values, setValues] = useState<ProductFormValues>(() =>
    product ? formFromProduct(product) : emptyProductForm,
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Create mode: slug + group follow the name until the user edits them
  const [autoSlug, setAutoSlug] = useState(!product);

  const original = product ? formFromProduct(product) : emptyProductForm;
  const dirty = JSON.stringify(values) !== JSON.stringify(original);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    const next = { ...values, [key]: value };
    if (key === 'slug' || key === 'productGroup') setAutoSlug(false);
    if (autoSlug && (key === 'title' || key === 'netWeightG')) {
      const base = slugify(next.title);
      next.productGroup = base;
      next.slug = base ? `${base}-${next.netWeightG.trim()}g` : '';
    }
    setValues(next);
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const fail = (err: unknown) => {
    const dup = duplicateError(err, values);
    if (dup) {
      setErrors((e) => ({ ...e, ...dup }));
      setFormError('That clashes with an existing product — see the highlighted field.');
    } else setFormError(isApiError(err) ? err.message : 'Couldn’t save. Check your connection and try again.');
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!product) {
      const { body, errors: errs } = buildCreateBody(values);
      setErrors(errs);
      if (!body) {
        setFormError('Some fields need attention.');
        focusFirstError();
        return;
      }
      create.mutate(body, {
        onSuccess: (p) => {
          toast({ title: 'Draft saved', description: 'Add photos and the lab details, then publish.' });
          void navigate(`/products/${p.id}`, { replace: true });
        },
        onError: fail,
      });
      return;
    }
    const { body, errors: errs, unchanged } = buildUpdateBody(values, original);
    setErrors(errs);
    if (unchanged) return;
    if (!body) {
      setFormError('Some fields need attention.');
      focusFirstError();
      return;
    }
    update.mutate(body, {
      onSuccess: (p) => {
        setValues(formFromProduct(p));
        toast({ title: 'Changes saved' });
      },
      onError: fail,
    });
  };

  const busy = create.isPending || update.isPending;
  const section = { values, errors, set, mode } as const;

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader
        eyebrow={<BackLink />}
        title={product ? product.title : 'New product'}
        description={
          product ? (
            <span className="flex flex-wrap items-center gap-2">
              <NonVegMark size="sm" />
              <Badge tone="batch">{product.sku}</Badge>
              <span>{product.productGroup}</span>
            </span>
          ) : (
            'Start with the basics and price. Lab details and photos can follow — the product stays a hidden draft until it’s complete.'
          )
        }
      />

      <form
        onSubmit={submit}
        noValidate
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="grid min-w-0 gap-6">
          <BasicsSection {...section} />
          <PricingSection {...section} />
          <FoodSafetySection {...section} />
          <ShippingSection {...section} />
          <FormSection
            id="images"
            title="Photos"
            description="Square photos look best. The first one is the storefront cover."
          >
            {product ? (
              <ImageManager product={product} />
            ) : (
              <EmptyState
                icon={ImagePlus}
                title="Save the draft first"
                description="Photos attach to a saved product. Save the draft, then add them here."
              />
            )}
          </FormSection>
          <SaveBar busy={busy} dirty={dirty} mode={mode} error={formError} />
        </div>

        <aside className="order-first grid gap-4 lg:sticky lg:top-24 lg:order-none" aria-label="Publishing">
          {product ? (
            <PublishPanel product={product} dirty={dirty} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>How publishing works</CardTitle>
                <CardDescription>
                  A product goes live only when it has a GST rate, lab-tested shelf life, ingredients, nutrition, packed
                  weight and at least one photo.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </aside>
      </form>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading product" className="grid gap-6">
      <div className="grid gap-2 border-b border-border pb-5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-6">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardContent className="grid gap-4 pt-6">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-11 w-full" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

export default function ProductEditorPage() {
  const { productId } = useParams();
  const query = useProduct(productId);

  if (!productId) return <ProductEditor />;
  if (query.isPending) return <EditorSkeleton />;
  if (query.isError) {
    if (isApiError(query.error, 'NOT_FOUND'))
      return (
        <EmptyState
          icon={PackageSearch}
          title="Product not found"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild variant="outline">
              <Link to="/products">Back to products</Link>
            </Button>
          }
        />
      );
    return (
      <div className="grid gap-4">
        <BackLink />
        <ErrorState
          title="Couldn’t load this product"
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }
  return <ProductEditor key={query.data.id} product={query.data} />;
}
