import { useNavigate } from 'react-router-dom';
import { ArrowRight, GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WorkflowStageTracker } from '@/components/shared/WorkflowStageTracker';
import { useData } from '@/context/DataContext';
import { WORKFLOWS } from '@/lib/workflows';

export default function Workflows() {
  const navigate = useNavigate();
  const { workItems } = useData();

  const detailedDemos = WORKFLOWS.filter((w) => w.detailed);

  return (
    <div>
      <PageHeader title="Shared Workflows" description="Cross-department processes involving multiple offices, from request to final approval." crumbs={[{ label: 'Shared Workflows' }]} />

      <Card className="mb-6 border-brand-200 bg-brand-50/40">
        <CardContent className="pt-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-brand-900"><GitBranch className="h-4 w-4" /> Featured Workflow Demonstrations</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {detailedDemos.map((w) => {
              const active = workItems.find((i) => i.processType === w.processType);
              return (
                <div key={w.processType} className="rounded-lg border border-brand-200 bg-surface p-3.5">
                  <p className="text-sm font-semibold text-slate-900">{w.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{w.description}</p>
                  {active && (
                    <div className="mt-3 rounded-md bg-slate-50 p-2">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase text-slate-400">Live Example — {active.id}</p>
                      <WorkflowStageTracker steps={active.approvalChain} />
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    {active && <Button size="sm" variant="outline" onClick={() => navigate(`/my-work/${active.id}`)}>View Example <ArrowRight className="h-3.5 w-3.5" /></Button>}
                    <Button size="sm" onClick={() => navigate(`/requests/new/${w.processType}`)}>Start Request</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">All Shared Workflows</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORKFLOWS.map((w) => {
          const activeCount = workItems.filter((i) => i.processType === w.processType && !['Approved', 'Completed', 'Rejected', 'Cancelled'].includes(i.status)).length;
          return (
            <Card key={w.processType} className="flex flex-col p-4">
              <p className="text-sm font-semibold text-slate-900">{w.name}</p>
              <p className="mt-1 flex-1 text-xs text-slate-500">{w.description}</p>
              <dl className="mt-3 space-y-1 text-xs text-slate-500">
                <div className="flex justify-between"><dt>Process Owner</dt><dd className="font-medium text-slate-700">{w.processOwner}</dd></div>
                <div className="flex justify-between"><dt>Departments</dt><dd className="flex gap-1">{w.departments.map((d) => <Badge key={d}>{d}</Badge>)}</dd></div>
                <div className="flex justify-between"><dt>Avg. Completion</dt><dd className="font-medium text-slate-700">{w.avgCompletionTime}</dd></div>
                <div className="flex justify-between"><dt>Active Requests</dt><dd className="font-medium text-brand-700">{activeCount}</dd></div>
              </dl>
              <Button size="sm" className="mt-3" onClick={() => navigate(`/requests/new/${w.processType}`)}>Start Request</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
