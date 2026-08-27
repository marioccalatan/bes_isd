import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  contentOverflowVisible?: boolean;
  contentOverflowHidden?: boolean;
  fixedHeight?: boolean;
}

const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-7xl' };

export function Dialog({ open, onClose, title, description, children, footer, headerActions, size = 'md', contentOverflowVisible = false, contentOverflowHidden = false, fixedHeight = false }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // Intentionally omitting onClose: it's read via a ref (kept fresh above)
    // so that dialogs wrapping controlled inputs don't re-run this effect
    // (and steal focus via ref.current?.focus()) on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        className={cn('relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl bg-surface shadow-2xl outline-none', fixedHeight && 'h-[90vh]', sizeClasses[size])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="dialog-title" className="truncate text-base font-semibold text-slate-900">{title}</h2>
              {headerActions}
            </div>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className={cn('min-h-0 flex-1 p-4 sm:p-5', contentOverflowHidden ? 'overflow-hidden' : contentOverflowVisible ? 'overflow-visible' : 'overflow-y-auto')}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4 sm:p-5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', destructive = false, requireRemarks = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (remarks?: string) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireRemarks?: boolean;
}) {
  const remarksRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-surface px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(remarksRef.current?.value)}
            className={cn(
              'inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-white',
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {requireRemarks && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Remarks <span className="text-red-600">*</span></label>
          <textarea ref={remarksRef} className="block w-full min-h-[80px] rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" placeholder="Required — explain the reason" />
        </div>
      )}
    </Dialog>
  );
}
