import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm',
  secondary: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500 shadow-sm',
  outline: 'border border-slate-300 bg-surface text-slate-700 hover:bg-slate-50 focus-visible:ring-brand-500',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-brand-500',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
  success: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-500 shadow-sm',
  link: 'text-brand-600 underline-offset-4 hover:underline p-0 h-auto',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
  icon: 'h-9 w-9',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        variantClasses[variant],
        variant !== 'link' && sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
