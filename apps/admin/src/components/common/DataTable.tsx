import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@pk/ui';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Extra classes for the header + body cells of this column. */
    className?: string;
    align?: 'right';
  }
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  /** Accessible name of the <table> and the phone card list. */
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column value types differ per column
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId: (row: T) => string;
  /** Phone (< 640px) layout: one card per row. */
  renderCard: (row: T) => ReactNode;
  /** Row → URL (row click on desktop, whole card is a link on phones). */
  getRowHref?: (row: T) => string;
  /** Row click without navigation (e.g. open an edit dialog). Cards become buttons. */
  onRowClick?: (row: T) => void;
  /** Accessible name for the card link/button, e.g. "Open order PK-7KQ2M9". */
  rowLabel?: (row: T) => string;
  /** Server-side sort (manualSorting): the parent maps it to the API's `sort` param. */
  sorting?: SortingState;
  onSortingChange?: (next: SortingState) => void;
  /** Server-side pagination; omit for short, unpaginated lists. */
  pagination?: DataTablePagination;
  /** A refetch is running (keepPreviousData) — dims the rows instead of flashing a skeleton. */
  fetching?: boolean;
  rowClassName?: (row: T) => string | undefined;
}

/**
 * Tier 3 table (Phase 9 §9.1) on TanStack Table v8 with SERVER-side sorting + pagination. ≥ 640px a
 * real <table> (scrolls inside its own container when wide); below 640px a card list.
 */
export function DataTable<T>({
  label,
  columns,
  data,
  getRowId,
  renderCard,
  getRowHref,
  onRowClick,
  rowLabel,
  sorting = [],
  onSortingChange,
  pagination,
  fetching,
  rowClassName,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  // TanStack Table v8 returns fresh functions each render; React Compiler skipping this component is expected
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange?.(next);
    },
  });

  const activate = (row: T) => {
    if (onRowClick) onRowClick(row);
    else if (getRowHref) void navigate(getRowHref(row));
  };
  const interactive = Boolean(onRowClick || getRowHref);

  return (
    <div data-testid="data-table" aria-busy={fetching || undefined} className="min-w-0">
      {/* Phones: card list */}
      <ul aria-label={label} className={cn('divide-y divide-border sm:hidden', fetching && 'opacity-60')}>
        {data.map((row) => {
          const id = getRowId(row);
          const body = renderCard(row);
          const cardClass =
            'block w-full px-5 py-4 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';
          return (
            <li key={id}>
              {getRowHref && !onRowClick ? (
                <Link to={getRowHref(row)} aria-label={rowLabel?.(row)} className={cardClass}>
                  {body}
                </Link>
              ) : onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  aria-label={rowLabel?.(row)}
                  className={cardClass}
                >
                  {body}
                </button>
              ) : (
                <div className="px-5 py-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Tablet + desktop: table */}
      <Table aria-label={label} containerClassName="hidden sm:block" className={cn(fetching && 'opacity-60')}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sortable = header.column.getCanSort() && Boolean(onSortingChange);
                const dir = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                    className={cn('first:pl-5 last:pr-5', meta?.align === 'right' && 'text-right', meta?.className)}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          '-mx-2 inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                          dir && 'text-foreground',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {dir === 'asc' ? (
                          <ArrowUp aria-hidden="true" className="size-3.5" />
                        ) : dir === 'desc' ? (
                          <ArrowDown aria-hidden="true" className="size-3.5" />
                        ) : (
                          <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={
                interactive
                  ? (e) => {
                      // Links / buttons inside the row keep their own behaviour
                      if ((e.target as HTMLElement).closest('a,button,input,label,[role="checkbox"]')) return;
                      activate(row.original);
                    }
                  : undefined
              }
              className={cn(interactive && 'cursor-pointer', rowClassName?.(row.original))}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta;
                return (
                  <TableCell
                    key={cell.id}
                    className={cn('first:pl-5 last:pr-5', meta?.align === 'right' && 'text-right', meta?.className)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pagination && <Pager {...pagination} />}
    </div>
  );
}

/** "Showing 26–50 of 248" + previous / next (44px targets). */
export function Pager({ page, pageSize, total, onPageChange }: DataTablePagination) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm text-muted-foreground"
    >
      <p className="tabular-nums" aria-live="polite">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <span className="hidden tabular-nums sm:inline">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/** Skeleton for the first load of a DataTable (same bleed + row rhythm). */
export { ListSkeleton as DataTableSkeleton } from './StateBlocks';
