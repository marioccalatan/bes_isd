import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { statusStyles, priorityStyles } from '@/lib/statusColors';
import type { Priority, WorkStatus } from '@/lib/types';

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
        'bg-slate-100 text-slate-700 border-slate-200',
        className
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status }: { status: WorkStatus }) {
  return <Badge className={statusStyles[status]}>{status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <Badge className={priorityStyles[priority]}>{priority}</Badge>;
}
