import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Pagination({ page, pageCount, onChange, total, pageSize }: { page: number; pageCount: number; onChange: (p: number) => void; total: number; pageSize: number }) {
  if (pageCount <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-200 px-1 py-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        Showing <span className="font-medium text-slate-700">{start}–{end}</span> of <span className="font-medium text-slate-700">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-slate-600">Page {page} of {pageCount}</span>
        <Button variant="outline" size="sm" onClick={() => onChange(Math.min(pageCount, page + 1))} disabled={page === pageCount} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
