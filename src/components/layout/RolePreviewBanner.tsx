import { Eye, X } from 'lucide-react';
import { useRolePreview } from '@/context/RolePreviewContext';

export function RolePreviewBanner() {
  const { isPreviewing, previewLabel, returnToAdministrator } = useRolePreview();
  if (!isPreviewing) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-gold-500 px-4 py-1.5 text-center text-xs font-semibold text-brand-950 no-print">
      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
      <span>You are viewing the demonstration as: {previewLabel}</span>
      <button onClick={returnToAdministrator} className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-950/10 px-2 py-0.5 hover:bg-brand-950/20">
        <X className="h-3 w-3" /> Return to Administrator
      </button>
    </div>
  );
}
