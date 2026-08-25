import { useEffect, useMemo, useState } from 'react';
import { HroTaskProcessingDrawer } from '@/components/shared/HroTaskProcessingDrawer';
import { MemberProgramsCsr } from '@/components/member-programs/MemberProgramsCsr';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { exportToCsv } from '@/hooks/useTableControls';
import { fetchHroToolTaskProcessing, type PolicyTaskProcessing } from '@/lib/api';
import type { WorkItem } from '@/lib/types';
import type { WorkspaceModuleDef, WorkspaceRecord } from '@/lib/workspace';
import { formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<WorkspaceRecord['status'], string> = {
  Active: 'border-brand-200 bg-brand-50 text-brand-700',
  Pending: 'border-gold-200 bg-gold-50 text-gold-800',
  Completed: 'border-green-200 bg-green-50 text-green-700',
  Ongoing: 'border-brand-200 bg-brand-50 text-brand-700',
  Scheduled: 'border-slate-200 bg-slate-100 text-slate-600',
};

export default function HumanResources({ module, taskSubject }: { module: WorkspaceModuleDef; taskSubject?: string }) {
  const { token } = useAuth();
  const { workItems } = useData();
  const { toast } = useToast();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [processingRecords, setProcessingRecords] = useState<PolicyTaskProcessing[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchHroToolTaskProcessing(token, module.id)
      .then((items) => { if (!cancelled) setProcessingRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: `Unable to load ${module.name} task details`, description: error instanceof Error ? error.message : 'Please try again.' }); });
    return () => { cancelled = true; };
  }, [module.id, module.name, toast, token]);

  const tasks = useMemo(() => workItems.filter((item) => {
    if (taskSubject) return String(item.fields.taskSubject ?? '').trim().toLowerCase() === taskSubject.toLowerCase();
    const office = String(item.fields.officeAssignment ?? '').toLowerCase();
    return office.split(/[,;|]/).some((value) => value.trim() === 'human resource office');
  }), [taskSubject, workItems]);

  const query = search.trim().toLowerCase();
  const visibleTasks = useMemo(() => !query ? tasks : tasks.filter((item) => [
    item.id, item.title, item.requestorName, item.assigneeName, item.fields.controlNumber, item.fields.taskSubject,
  ].some((value) => String(value ?? '').toLowerCase().includes(query))), [query, tasks]);
  const visibleRecords = useMemo(() => !query ? module.records : module.records.filter((record) => [
    record.title, record.subtitle, record.tag, record.status,
  ].some((value) => value.toLowerCase().includes(query))), [module.records, query]);

  const taskColumns: Column<WorkItem>[] = [
    { key: 'title', header: 'Task', render: (item) => <div><p className="font-medium text-slate-800">{item.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{item.id}</p></div> },
    { key: 'controlNumber', header: 'Control No.', render: (item) => String(item.fields.controlNumber ?? '—') },
    { key: 'subject', header: 'Subject', render: (item) => String(item.fields.taskSubject ?? '—') },
    { key: 'createdBy', header: 'Created By', render: (item) => item.requestorName },
    { key: 'assignedTo', header: 'Assigned To', render: (item) => item.assigneeName ?? 'Unassigned' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (item) => formatDate(item.dateSubmitted) },
    { key: 'status', header: 'My Work Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'processingStatus', header: `${module.name} Status`, render: (item) => <Badge>{processingRecords.find((record) => record.taskId === item.id)?.status ?? 'Received'}</Badge> },
  ];

  const selectedTask = selectedTaskId ? workItems.find((item) => item.id === selectedTaskId) ?? null : null;

  function replaceProcessingRecord(record: PolicyTaskProcessing) {
    setProcessingRecords((current) => current.some((item) => item.taskId === record.taskId)
      ? current.map((item) => item.taskId === record.taskId ? record : item)
      : [record, ...current]);
  }

  const recordColumns: Column<WorkspaceRecord>[] = [
    { key: 'title', header: 'Title', render: (record) => <span className="font-medium text-slate-800">{record.title}</span> },
    { key: 'subtitle', header: 'Detail', render: (record) => record.subtitle },
    { key: 'tag', header: 'Category', render: (record) => <Badge>{record.tag}</Badge> },
    { key: 'date', header: 'Date', render: (record) => formatDate(record.date) },
    { key: 'status', header: 'Status', render: (record) => <Badge className={STATUS_STYLES[record.status]}>{record.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} />
      {module.id !== 'member-programs' && <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {module.stats.map((stat) => <Card key={stat.label} className="p-4"><p className="text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-xl font-bold text-slate-900">{stat.value}</p></Card>)}
      </div>}

      <Tabs
        tabs={[{ value: 'tasks', label: 'Tasks', count: tasks.length }, { value: 'records', label: 'Records', count: module.records.length }, ...(module.id === 'member-programs' ? [{ value: 'csr', label: 'CSR' }] : [])]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5"
      />

      {tab === 'csr' ? <MemberProgramsCsr /> : <Card>
        <CardHeader>
          <CardTitle>{tab === 'tasks' ? `${module.name} Tasks` : `${module.name} Records`}</CardTitle>
          <p className="text-sm text-slate-500">{tab === 'tasks' ? (taskSubject ? `Live My Work tasks whose subject is ${taskSubject}.` : 'Live My Work tasks assigned to the Human Resource Office.') : `${module.name} operational records.`}</p>
        </CardHeader>
        <CardContent>
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            placeholder={tab === 'tasks' ? 'Search task, control number, subject…' : 'Search records…'}
            onExport={tab === 'records' ? () => exportToCsv(`${module.id}.csv`, ['Title', 'Detail', 'Category', 'Date', 'Status'], module.records.map((record) => [record.title, record.subtitle, record.tag, record.date, record.status])) : undefined}
            onPrint={() => window.print()}
          />
          {tab === 'tasks' ? (
            <DataTable columns={taskColumns} rows={visibleTasks} getRowId={(item) => item.id} onRowClick={(item) => setSelectedTaskId(item.id)} cardTitle={(item) => item.title} emptyTitle={`No ${module.name} tasks`} emptyDescription={taskSubject ? `My Work tasks with the subject ${taskSubject} will appear here.` : 'Tasks assigned to the Human Resource Office will appear here.'} />
          ) : (
            <DataTable columns={recordColumns} rows={visibleRecords} getRowId={(record) => record.id} onRowClick={setSelectedRecord} cardTitle={(record) => record.title} />
          )}
        </CardContent>
      </Card>}

      <HroTaskProcessingDrawer
        open={!!selectedTask}
        task={selectedTask}
        moduleId={module.id}
        moduleName={module.name}
        processing={selectedTask ? processingRecords.find((record) => record.taskId === selectedTask.id) : undefined}
        onClose={() => setSelectedTaskId(null)}
        onSaved={replaceProcessingRecord}
      />

      <Drawer open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={selectedRecord?.title ?? 'Record'}>
        {selectedRecord && <div className="space-y-3 text-sm"><div className="flex items-center gap-2"><Badge>{selectedRecord.tag}</Badge><Badge className={STATUS_STYLES[selectedRecord.status]}>{selectedRecord.status}</Badge></div><p className="text-slate-500">{formatDate(selectedRecord.date)}</p><p className="font-medium text-slate-800">{selectedRecord.subtitle}</p><p className="text-slate-600">{selectedRecord.description}</p></div>}
      </Drawer>
    </div>
  );
}
