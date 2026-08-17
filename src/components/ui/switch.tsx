import { cn } from '@/lib/utils';

export function Switch({
  checked, onChange, label, className,
}: { checked: boolean; onChange: (checked: boolean) => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded-full', className)}
    >
      <span className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-slate-300')}>
        <span className={cn('inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-1')} />
      </span>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
    </button>
  );
}
