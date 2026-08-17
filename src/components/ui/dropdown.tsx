import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DropdownMenu({
  trigger, children, align = 'right', className,
}: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: 'right' | 'left'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-2 max-h-[min(70vh,32rem)] min-w-[12rem] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-surface p-1.5 shadow-lg scrollbar-thin',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, className, danger }: { children: ReactNode; onClick?: () => void; className?: string; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-100',
        danger && 'text-red-600 hover:bg-red-50',
        className
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-slate-200" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</div>;
}
