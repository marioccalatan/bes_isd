import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useUI, TOUR_STEPS } from '@/context/UIContext';
import { Button } from '@/components/ui/button';

export function GuidedTour() {
  const { tourActive, tourStep, stopTour, nextTourStep, prevTourStep } = useUI();
  const navigate = useNavigate();
  const step = TOUR_STEPS[tourStep];

  useEffect(() => {
    if (tourActive) navigate(step.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourStep]);

  if (!tourActive) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4 no-print">
      <div className="flex w-full max-w-lg items-start gap-3 rounded-xl border border-brand-200 bg-surface p-4 shadow-2xl">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {tourStep + 1}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{step.title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{step.body}</p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === tourStep ? 'bg-brand-600' : 'bg-slate-200'}`} />
              ))}
            </div>
            <div className="flex gap-1.5">
              {tourStep > 0 && <Button variant="outline" size="sm" onClick={prevTourStep}>Back</Button>}
              {tourStep < TOUR_STEPS.length - 1 ? (
                <Button size="sm" onClick={nextTourStep}>Next</Button>
              ) : (
                <Button size="sm" onClick={stopTour}>Finish Tour</Button>
              )}
            </div>
          </div>
        </div>
        <button onClick={stopTour} aria-label="Close guided tour" className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
