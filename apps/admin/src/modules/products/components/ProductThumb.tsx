import { cn } from '@pk/ui';
import { ImageOff } from 'lucide-react';
import type { AdminProduct } from '@pk/shared';

export function ProductThumb({
  product,
  className,
}: {
  product: Pick<AdminProduct, 'images' | 'title'>;
  className?: string;
}) {
  const src = product.images[0]?.url;
  return (
    <span
      className={cn(
        'grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff aria-hidden="true" className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}
