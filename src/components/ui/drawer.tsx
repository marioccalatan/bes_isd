import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left';
  widthClass?: string;
  contentClassName?: string;
}

export function Drawer({ open, onClose, title, children, footer, side = 'right', widthClass = 'max-w-xl', contentClassName }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 no-print">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className={`absolute top-0 ${side === 'right' ? 'right-0' : 'left-0'} flex h-full w-full ${widthClass} flex-col bg-surface shadow-2xl animate-in`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 id="drawer-title" className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close panel" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', contentClassName)}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
