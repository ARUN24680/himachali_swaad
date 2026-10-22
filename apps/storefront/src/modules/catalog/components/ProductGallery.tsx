'use client';

import { cn } from '@pk/ui';
import Image from 'next/image';
import { useState } from 'react';
import { ProductImage } from '@/components/common/ProductImage';
import { resolveAssetUrl } from '@/lib/asset-url';

/** Main photo (fixed square → zero CLS) + thumbnail strip when there is more than one image. */
export function ProductGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const src = images[active] ?? images[0];
  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg border border-border">
        <ProductImage
          src={src}
          alt={images.length ? `${title} — photo ${active + 1} of ${images.length}` : title}
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
        />
      </div>
      {images.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Product photos">
          {images.map((img, i) => (
            <li key={img} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === active ? 'true' : undefined}
                className={cn(
                  'relative block size-16 overflow-hidden rounded-md border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-20',
                  i === active ? 'border-primary' : 'border-transparent opacity-80 hover:opacity-100',
                )}
              >
                <Image src={resolveAssetUrl(img)} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
