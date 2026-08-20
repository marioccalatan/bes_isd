import { Search, Download, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function Toolbar({
  search, onSearchChange, placeholder = 'Search…', children, onExport, onPrint, exportLabel = 'Export CSV',
}: { search: string; onSearchChange: (v: string) => void; placeholder?: string; children?: ReactNode; onExport?: () => void; onPrint?: () => void; exportLabel?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={placeholder} className="pl-8" aria-label="Search" />
        </div>
        {children}
      </div>
      {(onExport || onPrint) && (
        <div className="flex shrink-0 items-center gap-2 no-print">
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-3.5 w-3.5" /> {exportLabel}
            </Button>
          )}
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
