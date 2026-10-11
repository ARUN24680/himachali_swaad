import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES, type AdminProduct } from '@pk/shared';
import { Alert, Badge, Button, Progress, cn } from '@pk/ui';
import { AlertCircle, ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { toast } from '@/store/toast.store';
import { useProductImages } from '../hooks/useProductImages';

/** Product photos: drag/drop or pick, upload progress, reorder, make primary, remove. */
export function ImageManager({ product }: { product: AdminProduct }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { uploads, addFiles, dismiss, saveOrder, saving, saveError } = useProductImages(product);
  const images = product.images;
  const full = images.length + uploads.filter((u) => u.status !== 'error').length >= MAX_PRODUCT_IMAGES;

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const skipped = await addFiles(Array.from(list));
    if (skipped > 0)
      toast({
        tone: 'neutral',
        title: `Only ${MAX_PRODUCT_IMAGES} photos per product`,
        description: `${skipped} not added.`,
      });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const keys = images.map((i) => i.key);
  const move = (from: number, to: number) => {
    const next = [...keys];
    const [k] = next.splice(from, 1);
    if (k === undefined) return;
    next.splice(to, 0, k);
    void saveOrder(next).catch(() => undefined);
  };
  const remove = (index: number) => {
    void saveOrder(keys.filter((_, i) => i !== index))
      .then(() => toast({ title: 'Photo removed' }))
      .catch(() => undefined);
  };

  return (
    <div className="grid gap-4">
      {saveError && (
        <Alert tone="destructive">
          <AlertCircle aria-hidden="true" />
          Couldn’t save the photo order: {saveError.message}
        </Alert>
      )}

      {(images.length > 0 || uploads.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Product photos">
          {images.map((img, i) => (
            <li key={img.key} className="group relative overflow-hidden rounded-lg border border-border bg-muted">
              <img
                src={img.url}
                alt={`${product.title} photo ${i + 1}`}
                className="aspect-square w-full object-cover"
              />
              {i === 0 && (
                <Badge tone="primary" className="absolute top-2 left-2">
                  <Star aria-hidden="true" className="size-3" />
                  Primary
                </Badge>
              )}
              <div className="flex items-center justify-between gap-1 border-t border-border bg-card p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move photo ${i + 1} earlier`}
                  disabled={i === 0 || saving}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowLeft />
                </Button>
                {i !== 0 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Make photo ${i + 1} the primary photo`}
                    disabled={saving}
                    onClick={() => move(i, 0)}
                  >
                    <Star />
                  </Button>
                ) : (
                  <span className="size-11" aria-hidden="true" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move photo ${i + 1} later`}
                  disabled={i === images.length - 1 || saving}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowRight />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove photo ${i + 1}`}
                  disabled={saving}
                  onClick={() => remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
          {uploads.map((u) => (
            <li key={u.id} className="relative overflow-hidden rounded-lg border border-border bg-muted">
              <img
                src={u.previewUrl}
                alt=""
                className={cn('aspect-square w-full object-cover', u.status !== 'error' && 'opacity-60')}
              />
              <div className="grid gap-1.5 border-t border-border bg-card p-2.5">
                {u.status === 'error' ? (
                  <div className="flex items-start justify-between gap-1">
                    <p role="alert" className="text-xs text-destructive">
                      {u.error}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-m-2 shrink-0"
                      aria-label={`Dismiss ${u.name}`}
                      onClick={() => dismiss(u.id)}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
                      {u.status === 'saving' ? 'Saving…' : `Uploading ${u.progress}%`}
                    </span>
                    <Progress value={u.progress} aria-label={`Uploading ${u.name}`} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'grid cursor-pointer justify-items-center gap-2 rounded-lg border-2 border-dashed border-input px-4 py-8 text-center transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring',
          dragging ? 'border-ring bg-accent' : 'hover:bg-accent/50',
          full && 'pointer-events-none opacity-50',
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-full bg-muted text-accent-foreground [&_svg]:size-5"
        >
          <ImagePlus />
        </span>
        <span className="text-sm font-medium">
          {full ? `${MAX_PRODUCT_IMAGES} photos — that’s the limit` : 'Add photos'}
        </span>
        <span className="text-xs text-muted-foreground">
          Drop here or tap to choose · JPG, PNG or WebP · up to {MAX_IMAGE_BYTES / (1024 * 1024)} MB each · first photo
          is the storefront cover
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/webp,image/jpeg,image/png"
          multiple
          disabled={full}
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
