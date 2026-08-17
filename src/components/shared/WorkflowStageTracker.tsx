import { Check, X, RotateCcw, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApprovalStep } from '@/lib/types';

export function WorkflowStageTracker({ steps }: { steps: ApprovalStep[] }) {
  if (steps.length === 0) return null;
  const currentIndex = steps.findIndex((s) => s.status === 'Pending');

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start gap-0">
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = step.status === 'Approved' || step.status === 'Skipped';
          const isProblem = step.status === 'Returned' || step.status === 'Rejected';
          return (
            <li key={step.id} className="flex items-start">
              <div className="flex w-36 flex-col items-center text-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
                    isDone && 'border-green-500 bg-green-500 text-white',
                    isProblem && 'border-red-500 bg-red-500 text-white',
                    isCurrent && !isProblem && 'border-brand-600 bg-surface text-brand-600 ring-4 ring-brand-100',
                    !isDone && !isProblem && !isCurrent && 'border-slate-300 bg-surface text-slate-400'
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : step.status === 'Rejected' ? <X className="h-4 w-4" /> : step.status === 'Returned' ? <RotateCcw className="h-4 w-4" /> : isCurrent ? <Clock3 className="h-4 w-4" /> : i + 1}
                </div>
                <p className={cn('mt-2 text-xs font-semibold', isCurrent ? 'text-brand-700' : 'text-slate-600')}>{step.stepName}</p>
                <p className="text-[11px] text-slate-400">{step.approverName}</p>
                <p className={cn('mt-0.5 text-[10px] font-medium', isDone && 'text-green-600', isProblem && 'text-red-600', isCurrent && 'text-brand-600')}>
                  {step.status}
                </p>
              </div>
              {i < steps.length - 1 && <div className={cn('mt-4 h-0.5 w-8 shrink-0', isDone ? 'bg-green-400' : 'bg-slate-200')} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
