import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import { getToolIcon } from '@/lib/toolIcons';
import type { DepartmentId, WorkItem } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import NotFound from './NotFound';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canAccessTool } from '@/lib/toolAccess';

export default function ToolDetail() {
  const { deptId, toolCode } = useParams<{ deptId: DepartmentId; toolCode: string }>();
  const { tools, workItems } = useData();
  const { user } = useAuth();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewOffice, previewPosition } = useRolePreview();
  const navigate = useNavigate();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const tool = tools.find((item) => item.code === toolCode);
  const grant = tool?.access.find((item) => item.departmentId === deptId);

  const subjects = useMemo(
    () => new Set((tool?.taskSubjects ?? []).map((subject) => subject.trim().toLowerCase()).filter(Boolean)),
    [tool?.taskSubjects],
  );
  const tasks = useMemo(
    () => workItems.filter((item) => subjects.has(String(item.fields.taskSubject ?? '').trim().toLowerCase())),
    [subjects, workItems],
  );
  const query = search.trim().toLowerCase();
  const visibleTasks = useMemo(() => !query ? tasks : tasks.filter((item) => [
    item.id, item.title, item.requestorName, item.assigneeName, item.fields.controlNumber, item.fields.taskSubject,
  ].some((value) => String(value ?? '').toLowerCase().includes(query))), [query, tasks]);

  if (!tool || tool.status !== 'ENABLED' || !grant || grant.level === 'EXISTING' || !canAccessTool(tool, {
    role: effectiveRole,
    departmentCode: previewDepartmentId ?? user?.departmentCode,
    officeName: isPreviewing ? previewOffice : user?.unitName,
    positionTitle: isPreviewing ? previewPosition : user?.position,
  })) return <NotFound />;

  const Icon = getToolIcon(tool.iconKey);
  const columns: Column<WorkItem>[] = [
    { key: 'title', header: 'Task', render: (item) => <div><p className="font-medium text-slate-800">{item.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{item.id}</p></div> },
    { key: 'controlNumber', header: 'Control No.', render: (item) => String(item.fields.controlNumber ?? '—') },
    { key: 'subject', header: 'Subject', render: (item) => String(item.fields.taskSubject ?? '—') },
    { key: 'createdBy', header: 'Created By', render: (item) => item.requestorName },
    { key: 'assignedTo', header: 'Assigned To', render: (item) => item.assigneeName ?? 'Unassigned' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (item) => formatDate(item.dateSubmitted) },
    { key: 'status', header: 'Status', render: (item) => <StatusBadge status={item.status} /> },
  ];

  return (
    <div>
      <PageHeader title={tool.name} description={tool.description} crumbs={[
        { label: `${deptId} Workspace`, to: `/workspace/preview/${deptId}` },
        { label: tool.code },
      ]} />
      <Card className="mb-5 p-4"><div className="flex items-center gap-3"><span className="rounded-lg bg-brand-50 p-2.5"><Icon className="h-6 w-6 text-brand-700" /></span><div><p className="font-semibold text-slate-900">{tool.code}</p><p className="text-xs text-slate-500">{deptId}: {grant.level}</p></div></div></Card>
      <Tabs tabs={[{ value: 'tasks', label: 'Tasks', count: tasks.length }, { value: 'records', label: 'Records' }]} value={tab} onChange={(value) => { setTab(value); setSearch(''); }} className="mb-5" />
      <Card>
        <CardHeader><CardTitle>{tool.code} {tab === 'tasks' ? 'Tasks' : 'Records'}</CardTitle><p className="text-sm text-slate-500">{tab === 'tasks' ? 'Tasks from My Work whose Subject exactly matches this tool’s configured Task Subjects.' : `Operational records for ${tool.code}.`}</p></CardHeader>
        <CardContent>
          {tab === 'tasks' ? <><Toolbar search={search} onSearchChange={setSearch} placeholder="Search task, control number, subject…" /><DataTable columns={columns} rows={visibleTasks} getRowId={(item) => item.id} onRowClick={(item) => navigate(`/my-work/${encodeURIComponent(item.id)}`)} cardTitle={(item) => item.title} emptyTitle={`No ${tool.code} tasks`} emptyDescription={subjects.size ? 'Matching My Work tasks will appear here automatically.' : 'Configure at least one Task Subject for this tool in Administration.'} /></> : <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center"><p className="font-medium text-slate-700">{tool.recordsTable ? 'No Oracle records found' : 'Oracle table not configured'}</p><p className="mt-1 text-sm text-slate-500">{tool.recordsTable ? `Records for this tool are sourced from ${tool.recordsTable}.` : 'A BES_ISD_XXXXX Oracle table will be connected when this tool’s Records module is implemented.'}</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}
