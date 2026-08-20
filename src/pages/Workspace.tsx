import { useNavigate } from 'react-router-dom';
import { Ban, Eye, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnterpriseCalendar } from '@/components/shared/EnterpriseCalendar';
import { DepartmentWorkspaceContent } from '@/components/shared/DepartmentWorkspaceContent';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { useAuth } from '@/context/AuthContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate } from '@/lib/utils';
import { ISD_MODULES } from '@/lib/workspace';
import { canAccessTool } from '@/lib/toolAccess';
import { getToolIcon } from '@/lib/toolIcons';
import { useToast } from '@/context/ToastContext';

const PRIORITIES = [
  'Complete BES governance rollout to all six departments by Q4 2026',
  'Finalize the revised Employee Handbook for Board presentation',
  'Sustain 90%+ employee training completion rate',
  'Expand community electrification coverage in District 2',
];

const ISD_CALENDAR_DEPARTMENT_SCOPE = ['ISD'];

export default function Workspace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { departments, employees, news, documents, workItems, tools } = useData();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewOffice, previewPosition, returnToAdministrator } = useRolePreview();
  const dept = departments.find((d) => d.id === 'ISD')!;

  if (effectiveRole === 'Department Manager' && previewDepartmentId && previewDepartmentId !== 'ISD') {
    const previewDept = departments.find((d) => d.id === previewDepartmentId)!;
    const manager = employees.find((e) => e.id === previewDept.managerId);
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-medium text-gold-800">
          <span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5 shrink-0" /> Role Preview — you are viewing My Workspace as the {previewDept.name} manager.</span>
          <button onClick={returnToAdministrator} className="font-semibold underline">Return to my own workspace</button>
        </div>
        <PageHeader
          title={`My Workspace — ${previewDept.name}`}
          description={previewDept.mandate}
          crumbs={[{ label: 'My Workspace' }]}
          actions={<Button variant="outline" onClick={returnToAdministrator}>Return to ISD Workspace</Button>}
        />
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-4"><p className="text-xs text-slate-500">Department Manager</p><p className="mt-1 text-sm font-bold text-slate-900">{manager?.name ?? previewDept.shortName + ' Manager'}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Employee Count</p><p className="mt-1 text-lg font-bold text-slate-900">{previewDept.employeeCount}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Units</p><p className="mt-1 text-lg font-bold text-slate-900">{previewDept.units.length}</p></Card>
          <Card className="p-4"><p className="text-xs text-slate-500">Location</p><p className="mt-1 text-sm font-bold text-slate-900">{previewDept.location}</p></Card>
        </div>
        <DepartmentWorkspaceContent deptId={previewDept.id} />
      </div>
    );
  }

  const accessIdentity = {
    role: effectiveRole,
    departmentCode: previewDepartmentId ?? user?.departmentCode ?? 'ISD',
    officeName: isPreviewing ? previewOffice : user?.unitName,
    positionTitle: isPreviewing ? previewPosition : user?.position,
  };
  const isdTools = tools.filter((tool) => tool.access.some((grant) => grant.departmentId === 'ISD') && canAccessTool(tool, accessIdentity));
  const accessibleModules = ISD_MODULES.filter((module) => isdTools.some((tool) => tool.code === module.name));
  const moduleNames = new Set(ISD_MODULES.map((module) => module.name));
  const otherAccessibleTools = isdTools.filter((tool) => !moduleNames.has(tool.code));
  const deptAnnouncements = news.filter((n) => n.issuingOffice.includes('Institutional')).slice(0, 4);
  const deptDocs = documents.filter((d) => d.owner === 'ISD').slice(0, 5);
  const deptWorkItems = workItems.filter((w) => w.departmentId === 'ISD');
  const pendingApprovals = deptWorkItems.filter((w) => w.status === 'Pending Approval').length;
  const inProgress = deptWorkItems.filter((w) => w.status === 'In Progress' || w.status === 'Submitted').length;
  const completed = deptWorkItems.filter((w) => w.status === 'Completed' || w.status === 'Approved').length;

  return (
    <div>
      <PageHeader
        title="My Workspace — Institutional Services Department"
        description={dept.mandate}
        crumbs={[{ label: 'My Workspace' }]}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-slate-500">Department Manager</p><p className="mt-1 text-sm font-bold text-slate-900">{CURRENT_EMPLOYEE.name}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Employee Count</p><p className="mt-1 text-lg font-bold text-slate-900">{dept.employeeCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Pending Approvals</p><p className="mt-1 text-lg font-bold text-gold-700">{pendingApprovals}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">In Progress / Completed</p><p className="mt-1 text-lg font-bold text-slate-900">{inProgress} <span className="text-sm font-normal text-slate-400">/ {completed}</span></p></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Accessible Tools</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {accessibleModules.map((m) => {
                  const tool = isdTools.find((item) => item.code === m.name)!;
                  const status = tool.status ?? 'ENABLED';
                  return <button key={m.id} title={status === 'SOON' ? tool.description : undefined} aria-disabled={status === 'SOON'} onClick={() => status === 'SOON' ? undefined : status === 'DISABLED' ? toast({ kind: 'warning', title: 'Temporarily Disabled', description: tool.description }) : navigate(`/workspace/${m.id}`)} className={`relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${status === 'SOON' ? 'cursor-help border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'}`}><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${status === 'SOON' ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-600'}`}><m.icon className="h-4.5 w-4.5" /></div><span className={`text-xs font-semibold ${status === 'SOON' ? 'text-slate-500' : 'text-slate-800'}`}>{m.name}</span>{status === 'SOON' && <Badge className="absolute right-2 top-2 border-slate-200 bg-slate-100 text-slate-500">SOON</Badge>}{status === 'DISABLED' && <Ban className="absolute right-2 top-2 h-4 w-4 text-red-600" />}</button>;
                })}
                {otherAccessibleTools.map((tool) => {
                  const Icon = getToolIcon(tool.iconKey);
                  const status = tool.status ?? 'ENABLED';
                  return <button key={tool.code} title={status === 'SOON' ? tool.description : undefined} aria-disabled={status === 'SOON'} onClick={() => status === 'SOON' ? undefined : status === 'DISABLED' ? toast({ kind: 'warning', title: 'Temporarily Disabled', description: tool.description }) : navigate(`/workspace/preview/ISD/tools/${encodeURIComponent(tool.code)}`)} className={`relative flex flex-col items-start gap-2 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${status === 'SOON' ? 'cursor-help border-slate-200 bg-slate-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'}`}><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${status === 'SOON' ? 'bg-slate-100 text-slate-400' : 'bg-brand-50 text-brand-600'}`}><Icon className="h-4.5 w-4.5" /></div><span className={`text-xs font-semibold ${status === 'SOON' ? 'text-slate-500' : 'text-slate-800'}`}>{tool.code}</span>{status === 'SOON' && <Badge className="absolute right-2 top-2 border-slate-200 bg-slate-100 text-slate-500">SOON</Badge>}{status === 'DISABLED' && <Ban className="absolute right-2 top-2 h-4 w-4 text-red-600" />}</button>;
                })}
                {effectiveRole === 'Administrator' && (
                  <button onClick={() => navigate('/workspace/governance')} className="flex flex-col items-start gap-2 rounded-lg border-2 border-gold-300 bg-gold-50/60 p-3 text-left hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-100 text-gold-700"><ShieldCheck className="h-4.5 w-4.5" /></div>
                    <span className="text-xs font-semibold text-gold-900">BES Governance and Adoption</span>
                  </button>
                )}
                {accessibleModules.length === 0 && otherAccessibleTools.length === 0 && effectiveRole !== 'Administrator' && <p className="col-span-full py-6 text-center text-sm text-slate-500">No workspace tools are assigned to your department, office, or position.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Department Calendar</CardTitle></CardHeader>
            <CardContent><EnterpriseCalendar size="compact" departmentScopeIds={ISD_CALENDAR_DEPARTMENT_SCOPE} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Current Priorities</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {PRIORITIES.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> {p}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Department Announcements</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {deptAnnouncements.map((n) => (
                <button key={n.id} onClick={() => navigate(`/news/${n.id}`)} className="flex w-full flex-col items-start gap-0.5 rounded-lg p-2 text-left hover:bg-slate-50">
                  <span className="text-sm font-medium text-slate-800">{n.title}</span>
                  <span className="text-xs text-slate-400">{formatDate(n.date)}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recently Updated Records</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {deptDocs.map((d) => (
                <button key={d.id} onClick={() => navigate(`/documents/${d.id}`)} className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{d.title}</span>
                  <StatusBadge status={d.status === 'Active' ? 'Approved' : 'Submitted'} />
                </button>
              ))}
            </CardContent>
          </Card>

          <Badge className="block w-fit border-slate-200 bg-slate-50 text-slate-500">Employees shown: {employees.filter((e) => e.departmentId === 'ISD').length} of {dept.employeeCount} official headcount (sample directory)</Badge>
        </div>
      </div>
    </div>
  );
}
