import type { ProductDetail } from '@pk/shared';
import { Badge, NonVegMark } from '@pk/ui';
import { ChevronRight, Droplets, Leaf, Mountain, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PendingValue } from '@/components/common/PendingValue';
import { seller } from '@/config/site';
import { MEAT_LABEL, formatDate, formatWeight, shelfLifeLabel } from '../lib/format';
import { NutritionTable } from './NutritionTable';
import { PincodeChecker } from './PincodeChecker';
import { ProductGallery } from './ProductGallery';
import { PurchasePanel } from './PurchasePanel';
import { SpiceLevel } from './SpiceLevel';
import { ViewItemTracker } from './ViewItemTracker';

/** Generic jar care used only when the kitchen hasn't written product-specific storage instructions. */
const DEFAULT_STORAGE =
  'Always use a clean, dry spoon. Keep the lid tightly closed and store in a cool, dry place away from direct sunlight. Keep the pickle under its layer of oil.';

/**
 * Product detail (Phase 4 §4.4 + doc 03 §5 compliance): gallery, variant, MRP incl. taxes, stock,
 * ingredients, allergens, nutrition per 100 g, spice, shelf life + storage, FSSAI no., net weight,
 * current batch mfg / best-before, pincode checker, sticky mobile ATC.
 */
export function ProductDetailView({ product }: { product: ProductDetail }) {
  const fssai = product.fssaiLicenseNo ?? seller.fssaiLicenseNo;
  const weight = formatWeight(product.netWeightG);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 pb-28 md:px-8 md:pt-6 md:pb-20">
      <ViewItemTracker
        item={{
          productId: product.id,
          name: product.title,
          variant: weight,
          unitPricePaise: product.pricePaise,
          quantity: 1,
        }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground md:mb-6">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
            >
              Home
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <li>
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-0"
            >
              Pickles
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <li aria-current="page" className="truncate text-foreground">
            {product.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2 md:gap-10 lg:gap-14">
        <div className="md:sticky md:top-24 md:self-start">
          <ProductGallery images={product.images} title={`${product.title}, ${weight} jar`} />
        </div>

        <div className="grid content-start gap-6">
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">
              <NonVegMark size="md" />
              <span>Non-veg · {MEAT_LABEL[product.meatType]} pickle</span>
            </p>
            <h1 className="font-serif text-3xl leading-tight font-medium text-balance text-foreground md:text-4xl">
              {product.title}
            </h1>
            {product.shortDescription && (
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">{product.shortDescription}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="tabular-nums">Net wt. {weight}</span>
              {product.spiceLevel !== null && <SpiceLevel level={product.spiceLevel} />}
            </div>
          </div>

          <PurchasePanel product={product} />

          {product.currentBatch && (
            <div className="grid gap-2 rounded-lg border border-tertiary/30 bg-tertiary/10 p-4">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                Ships from batch
                <Badge tone="batch">{product.currentBatch.batchCode}</Badge>
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Manufactured</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {formatDate(product.currentBatch.manufacturedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Best before</dt>
                  <dd className="font-medium text-foreground tabular-nums">
                    {formatDate(product.currentBatch.expiryDate)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <PincodeChecker />

          <ul className="grid grid-cols-2 gap-3 text-sm">
            <Assurance icon={<Droplets />} title="Cold-pressed mustard oil" />
            <Assurance icon={<Leaf />} title="No added preservatives" />
            <Assurance icon={<Mountain />} title="Small batches, Himachal kitchen" />
            <Assurance icon={<Truck />} title="Prepaid, tracked delivery" />
          </ul>
        </div>
      </div>

      <div className="mt-12 grid gap-10 md:mt-16 lg:grid-cols-2 lg:gap-14">
        <section aria-labelledby="about-heading" className="grid content-start gap-6">
          <Fact id="about-heading" title="About this pickle">
            <p className="leading-relaxed whitespace-pre-line text-foreground/90">{product.description}</p>
          </Fact>
          <Fact title="Ingredients">
            <PendingValue value={product.ingredients} label="Ingredients">
              {(v) => <span className="leading-relaxed text-foreground/90">{v}</span>}
            </PendingValue>
          </Fact>
          <Fact title="Allergens">
            <PendingValue value={product.allergens} label="Allergen information">
              {(v) => <span className="text-foreground/90">{v}</span>}
            </PendingValue>
          </Fact>
          <Fact title="Shelf life & storage">
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="font-medium text-foreground">Shelf life</dt>
                <dd className="text-muted-foreground">
                  <PendingValue
                    value={product.shelfLifeDays ? `${shelfLifeLabel(product.shelfLifeDays)} from manufacture` : null}
                    label="Shelf life"
                  />
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Storage</dt>
                <dd className="leading-relaxed text-muted-foreground">
                  {product.storageInstructions ?? DEFAULT_STORAGE}
                </dd>
              </div>
            </dl>
          </Fact>
        </section>

        <section aria-labelledby="label-heading" className="grid content-start gap-6">
          <Fact title="Nutrition (per 100 g)">
            {product.nutrition ? (
              <NutritionTable nutrition={product.nutrition} />
            ) : (
              <PendingValue value={null} label="Nutrition information" />
            )}
          </Fact>
          <Fact id="label-heading" title="Label information">
            <dl className="divide-y divide-border rounded-lg border border-border text-sm">
              <LabelRow term="Food type">
                <span className="inline-flex items-center gap-2">
                  <NonVegMark size="sm" /> Non-vegetarian
                </span>
              </LabelRow>
              <LabelRow term="Net weight">{weight}</LabelRow>
              <LabelRow term="MRP">Inclusive of all taxes</LabelRow>
              <LabelRow term="FSSAI Lic. No.">
                <PendingValue value={fssai} label="FSSAI licence number" />
              </LabelRow>
              {product.currentBatch && (
                <>
                  <LabelRow term="Batch no.">{product.currentBatch.batchCode}</LabelRow>
                  <LabelRow term="Mfg. date">{formatDate(product.currentBatch.manufacturedAt)}</LabelRow>
                  <LabelRow term="Best before">{formatDate(product.currentBatch.expiryDate)}</LabelRow>
                </>
              )}
              <LabelRow term="Country of origin">India</LabelRow>
              <LabelRow term="Marketed by">
                <PendingValue value={seller.legalName} label="Seller legal entity" />
              </LabelRow>
            </dl>
          </Fact>
        </section>
      </div>
    </div>
  );
}

function Fact({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <div className="grid gap-3">
      <h2 id={id} className="font-serif text-xl font-medium text-foreground md:text-2xl">
        {title}
      </h2>
      {children}
    </div>
  );
}

function LabelRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 px-4 py-2.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0 break-words text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

function Assurance({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 text-foreground [&_svg]:size-4.5 [&_svg]:shrink-0 [&_svg]:text-accent-foreground">
      <span aria-hidden="true">{icon}</span>
      <span className="leading-snug">{title}</span>
    </li>
  );
}
