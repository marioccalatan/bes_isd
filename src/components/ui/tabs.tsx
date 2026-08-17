import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({ tabs, value, onChange, className }: { tabs: TabItem[]; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Tabs" className={cn('flex gap-1 overflow-x-auto scrollbar-thin border-b border-slate-200', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500')}>
                {t.count}
              </span>
            )}
            {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-surface text-slate-600 hover:bg-slate-50'
      )}
    >
      {label}
    </button>
  );
}
