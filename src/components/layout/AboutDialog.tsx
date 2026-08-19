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
      title="About BES"
      description="BENECO Enterprise System (BES)"
      size="lg"
      footer={<Button onClick={() => setAboutOpen(false)}>Close</Button>}
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          This application is the evolving <strong>BENECO Enterprise System</strong> workspace. Core employee,
          administration, calendar, profile, and task-assignment modules are connected to Oracle while other
          workflow areas may still be expanded as the system is completed.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <DatabaseZap className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Oracle-backed modules are live.</strong> Users, profiles, calendar events, and task assignments are loaded from the BES Oracle schema.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <Lock className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Access remains controlled.</strong> Roles, profile updates, and administration actions are separated so sensitive fields such as passwords stay protected.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <Workflow className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Workflows are being built module by module.</strong> Calendar items can be classified, tracked, and converted into assignable work tasks.</p>
          </div>
          <div className="flex gap-2.5 rounded-lg border border-slate-200 p-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-brand-600" />
            <p><strong className="block text-slate-800">Production hardening is still required.</strong> Security, privacy, records management, backups, and infrastructure policies should be finalized before official rollout.</p>
          </div>
        </div>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          BES is built with React, TypeScript, Tailwind CSS, and Oracle-backed API services. Some user
          interface areas may still contain placeholder workflows until their corresponding Oracle modules are completed.
        </p>
      </div>
    </Dialog>
  );
}
