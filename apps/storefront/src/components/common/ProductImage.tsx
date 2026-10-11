import { cn } from '@pk/ui';
import Image from 'next/image';
import { JarIllustration } from './MountainRidges';

/**
 * Square product photo with a fixed aspect ratio (zero CLS). Falls back to a token-drawn jar when
 * the product has no image. `zoomOnHover` applies only on hover-capable pointers (desktop).
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
  return (
    <div className={cn('relative aspect-square overflow-hidden bg-muted', className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
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
