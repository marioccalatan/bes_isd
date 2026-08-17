import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const baseFieldClasses =
  'block w-full rounded-md border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 disabled:text-slate-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(baseFieldClasses, invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/30', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(baseFieldClasses, 'min-h-[90px] resize-y', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/30', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(baseFieldClasses, 'pr-8', invalid && 'border-red-400 focus:border-red-500 focus:ring-red-500/30', className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export function Label({ className, required, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('mb-1 block text-sm font-medium text-slate-700', className)} {...props}>
      {children}
      {required && <span className="ml-0.5 text-red-600" aria-hidden="true">*</span>}
    </label>
  );
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1 text-xs font-medium text-red-600" role="alert">{children}</p>;
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-slate-500">{children}</p>;
}

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn('h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30', className)}
      {...props}
    />
  )
);
Checkbox.displayName = 'Checkbox';
