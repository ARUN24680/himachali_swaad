import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Small label above the title (breadcrumb / section). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

/** Tier 1 of the Nexus 3-tier layout (doc 04): title + primary actions. */
export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="grid min-w-0 gap-1">
        {eyebrow && (
          <div className="text-xs font-semibold tracking-[0.12em] text-accent-foreground uppercase">{eyebrow}</div>
        )}
        <h1 className="font-serif text-3xl leading-tight font-medium text-foreground md:text-4xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
    </header>
  );
}
