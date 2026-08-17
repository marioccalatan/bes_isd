import { Dialog } from '@/components/ui/dialog';
import { useUI } from '@/context/UIContext';
import { Button } from '@/components/ui/button';
import { ShieldAlert, DatabaseZap, Workflow, Lock } from 'lucide-react';

export function AboutDialog() {
  const { aboutOpen, setAboutOpen } = useUI();
  return (
    <Dialog
      open={aboutOpen}
      onClose={() => setAboutOpen(false)}
      title="About This Prototype"
      description="BENECO Enterprise System (BES) — Management Demonstration"
      size="lg"
      footer={<Button onClick={() => setAboutOpen(false)}>Close</Button>}
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          This application is a <strong>conceptual management demonstration</strong> of a proposed centralized
          digital workplace for BENECO. It is designed to help management experience the intended navigation,
          workflows, and information architecture before any production investment is made.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <DatabaseZap className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">All data is simulated.</strong> Every employee, transaction, and figure shown is fictional and generated for this demonstration only.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <Lock className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">No official records are stored.</strong> No genuine personnel, payroll, operational, or consumer data is used or retained anywhere in this prototype.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <Workflow className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Workflows require formal validation.</strong> Approval routing, access rules, and business logic shown here are illustrative and subject to formal process owner review.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Production requires further review.</strong> A production implementation requires formal security, privacy, integration, records-management, and infrastructure reviews.</p>
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          BES Management Demonstration — Mock Data. Built with React, TypeScript, Tailwind CSS, and browser
          localStorage for prototype persistence. No backend, database, or external service is used.
        </p>
      </div>
    </Dialog>
  );
}
