'use client';

import { cn } from '@pk/ui';
import Image from 'next/image';
import { useState } from 'react';
import { resolveAssetUrl } from '@/lib/asset-url';
import { JarIllustration } from './MountainRidges';

/**
 * Square product photo with a fixed aspect ratio (zero CLS). Falls back to a token-drawn jar when
 * the product has no image OR the image fails to load, so a card never shows a broken-image icon.
 * `zoomOnHover` applies only on hover-capable pointers (desktop) and respects reduced motion.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  zoomOnHover = false,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  zoomOnHover?: boolean;
  className?: string;
}) {
  const resolved = src ? resolveAssetUrl(src) : null;
  // Remember which src failed (not a boolean) so switching to another src retries automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = resolved !== null && failedSrc !== resolved;

  return (
    <div className={cn('relative aspect-square overflow-hidden bg-muted', className)}>
      {showImage ? (
        <Image
          src={resolved}
          alt={alt}
          fill
          sizes={sizes}
          // Next 16: `preload` replaces the deprecated `priority`; fetchpriority=high for the LCP image
          preload={priority}
          fetchPriority={priority ? 'high' : undefined}
          onError={() => setFailedSrc(resolved)}
          className={cn(
            'object-cover',
            zoomOnHover &&
              'transition-transform duration-500 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-105',
          )}
        />
      ) : (
        <JarIllustration label={alt} />
      )}
    </div>
  );
}
