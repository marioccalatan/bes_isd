import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  hideOnCard?: boolean;
}

export function DataTable<T>({
  columns, rows, getRowId, onRowClick, sortKey, sortDir, onSort, emptyTitle = 'No records found', emptyDescription = 'Try adjusting your filters or search terms.',
  cardTitle, selectable, selectedIds, onToggleSelect,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  cardTitle?: (row: T) => ReactNode;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {selectable && <th className="w-10 px-3 py-2.5"><span className="sr-only">Select</span></th>}
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cn('px-3 py-2.5 font-semibold', col.className)}>
                  {col.sortable ? (
                    <button className="inline-flex items-center gap-1 hover:text-slate-800" onClick={() => onSort?.(col.key)}>
                      {col.header}
                      {sortKey === col.key ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const id = getRowId(row);
              return (
                <tr
                  key={id}
                  onClick={() => onRowClick?.(row)}
                  className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-brand-50/40')}
                >
                  {selectable && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" checked={selectedIds?.has(id)} onChange={() => onToggleSelect?.(id)} aria-label={`Select row ${id}`} />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-3 py-2.5 align-middle text-slate-700', col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {rows.map((row) => {
          const id = getRowId(row);
          return (
            <div
              key={id}
              onClick={() => onRowClick?.(row)}
              className={cn('rounded-lg border border-slate-200 bg-surface p-3 shadow-sm', onRowClick && 'cursor-pointer active:bg-brand-50/40')}
            >
              {cardTitle && <div className="mb-2 font-semibold text-slate-900">{cardTitle(row)}</div>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {columns.filter((c) => !c.hideOnCard).map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className="text-slate-400">{col.header}</dt>
                    <dd className="truncate text-slate-700">{col.render(row)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </>
  );
}
