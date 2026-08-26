import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { HroTaskProcessingDrawer } from '@/components/shared/HroTaskProcessingDrawer';
import { MemberProgramsCsr } from '@/components/member-programs/MemberProgramsCsr';
import { MemberProgramsOperations } from '@/components/member-programs/MemberProgramsOperations';
import { MemberProgramsPrograms } from '@/components/member-programs/MemberProgramsPrograms';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { exportToCsv } from '@/hooks/useTableControls';
import { fetchCsrRequests, fetchHroToolTaskProcessing, fetchUserDirectory, type DirectoryUser, type PolicyTaskProcessing } from '@/lib/api';
import type { Priority, WorkItem } from '@/lib/types';
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
  const { token, user } = useAuth();
  const { workItems, departments, createTaskFromCalendarEvent } = useData();
  const { toast } = useToast();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [processingRecords, setProcessingRecords] = useState<PolicyTaskProcessing[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(null);
  const [csrCount, setCsrCount] = useState(0);
  const [communityRelationsCount, setCommunityRelationsCount] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskControlNumber, setTaskControlNumber] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignee, setTaskAssignee] = useState(user?.username ?? '');
  const [taskDepartment, setTaskDepartment] = useState(user?.departmentCode ?? '');
  const [taskPriority, setTaskPriority] = useState<Priority>('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('Corporate Social Responsibility');

  useEffect(() => {
    if (!taskOpen || !token) return;
    fetchUserDirectory(token)
      .then((users) => { setDirectoryUsers(users); if (!taskAssignee && users.length) setTaskAssignee(user?.username ?? users[0].username); })
      .catch((error) => toast({ kind: 'error', title: 'Users not loaded', description: error instanceof Error ? error.message : 'Unable to load the employee directory.' }));
  }, [taskAssignee, taskOpen, toast, token, user?.username]);

  function openNewTask() {
    setTaskTitle(''); setTaskControlNumber(''); setTaskDescription(''); setTaskAssignee(user?.username ?? '');
    setTaskDepartment(user?.departmentCode ?? ''); setTaskPriority('Normal'); setTaskDueDate('');
    setNewTaskSubject('Corporate Social Responsibility'); setTaskOpen(true);
  }

  async function submitNewTask() {
    if (!taskTitle.trim()) { toast({ kind: 'error', title: 'Task title required', description: 'Enter a short title for the task.' }); return; }
    if (!taskAssignee) { toast({ kind: 'error', title: 'Assignee required', description: 'Select the employee who should receive this task.' }); return; }
    setSavingTask(true);
    const result = await createTaskFromCalendarEvent({ calendarEventId: '', controlNumber: taskControlNumber.trim() || undefined, title: taskTitle.trim(), description: taskDescription.trim() || undefined, assigneeUsername: taskAssignee, departmentId: taskDepartment || undefined, officeAssignment: 'Community Relations Office', taskSubject: newTaskSubject, priority: taskPriority, dueDate: taskDueDate || undefined });
    setSavingTask(false);
    if (!result.ok) { toast({ kind: 'error', title: 'Task not created', description: result.error }); return; }
    setTaskOpen(false);
    toast({ kind: 'success', title: 'Task created', description: `${result.task.id} was added here and to My Work.` });
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchHroToolTaskProcessing(token, module.id)
      .then((items) => { if (!cancelled) setProcessingRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: `Unable to load ${module.name} task details`, description: error instanceof Error ? error.message : 'Please try again.' }); });
    return () => { cancelled = true; };
  }, [module.id, module.name, toast, token]);

  useEffect(() => {
    if (!token || module.id !== 'member-programs') return;
    let cancelled = false;
    fetchCsrRequests(token)
      .then((items) => { if (!cancelled) { setCsrCount(items.filter((item) => item.programType !== 'Linkages').length); setCommunityRelationsCount(items.filter((item) => item.programType === 'Linkages').length); } })
      .catch(() => { if (!cancelled) { setCsrCount(0); setCommunityRelationsCount(0); } });
    return () => { cancelled = true; };
  }, [module.id, token]);

  const tasks = useMemo(() => workItems.filter((item) => {
    if (module.id === 'member-programs') {
      return ['community programs', 'corporate social responsibility', 'community relations']
        .includes(String(item.fields.taskSubject ?? '').trim().toLowerCase());
    }
    if (taskSubject) return String(item.fields.taskSubject ?? '').trim().toLowerCase() === taskSubject.toLowerCase();
    const office = String(item.fields.officeAssignment ?? '').toLowerCase();
    return office.split(/[,;|]/).some((value) => value.trim() === 'human resource office');
  }), [module.id, taskSubject, workItems]);

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
        tabs={[{ value: 'tasks', label: 'Tasks', count: tasks.length }, ...(module.id === 'member-programs' ? [{ value: 'csr', label: 'CSR', count: csrCount }, { value: 'community-relations', label: 'Community Relations', count: communityRelationsCount }, { value: 'operations', label: 'Operations' }, { value: 'programs', label: 'Programs' }] : [{ value: 'records', label: 'Records', count: module.records.length }])]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5"
      />

      {tab === 'csr' ? <MemberProgramsCsr onCountChange={setCsrCount} /> : tab === 'community-relations' ? <MemberProgramsCsr onCountChange={setCommunityRelationsCount} programType="Linkages" title="Linkages" description="Community linkages, evaluation, project requirements, events, and funding." requestLabel="Request" /> : tab === 'operations' ? <MemberProgramsOperations /> : tab === 'programs' ? <MemberProgramsPrograms /> : <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div><CardTitle>{tab === 'tasks' ? `${module.name} Tasks` : `${module.name} Records`}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{tab === 'tasks' ? (taskSubject ? `Live My Work tasks whose subject is ${taskSubject}.` : 'Live My Work tasks assigned to the Human Resource Office.') : `${module.name} operational records.`}</p></div>
          {tab === 'tasks' && module.id === 'member-programs' && <Button onClick={openNewTask}><Plus className="h-4 w-4" /> New Task</Button>}
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

      <Dialog open={taskOpen} onClose={() => { if (!savingTask) setTaskOpen(false); }} title="New Community Programs Task" description="Create a shared task without leaving this workspace." size="md" footer={<><Button variant="outline" disabled={savingTask} onClick={() => setTaskOpen(false)}>Cancel</Button><Button disabled={savingTask} onClick={() => void submitNewTask()}><Plus className="h-4 w-4" /> {savingTask ? 'Creating…' : 'Create Task'}</Button></>}>
        <div className="grid gap-4">
          <div><Label htmlFor="community-task-title" required>Task title</Label><Input id="community-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Enter task title" autoFocus /></div>
          <div><Label htmlFor="community-task-control">Control number</Label><Input id="community-task-control" value={taskControlNumber} onChange={(event) => setTaskControlNumber(event.target.value)} placeholder="Optional control number" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="community-task-assignee" required>Assign to</Label><Select id="community-task-assignee" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}><option value="">Select employee</option>{directoryUsers.map((person) => <option key={person.username} value={person.username}>{[person.firstName, person.lastName].filter(Boolean).join(' ') || person.name}</option>)}</Select></div>
            <div><Label htmlFor="community-task-department">Department</Label><Select id="community-task-department" value={taskDepartment} onChange={(event) => setTaskDepartment(event.target.value)}><option value="">Use my department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></div>
            <div><Label>Office assignment</Label><Input value="Community Relations Office" disabled readOnly /></div>
            <div><Label htmlFor="community-task-subject">Subject</Label><Select id="community-task-subject" value={newTaskSubject} onChange={(event) => setNewTaskSubject(event.target.value)}><option value="Corporate Social Responsibility">Corporate Social Responsibility</option><option value="Community Relations">Community Relations</option></Select></div>
            <div><Label htmlFor="community-task-priority">Priority</Label><Select id="community-task-priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)}>{['Low', 'Normal', 'High', 'Urgent'].map((priority) => <option key={priority}>{priority}</option>)}</Select></div>
            <div><Label htmlFor="community-task-due">Due date</Label><Input id="community-task-due" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></div>
          </div>
          <div><Label htmlFor="community-task-description">Instructions / notes</Label><Textarea id="community-task-description" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Add instructions, expected output, links, or context." /></div>
        </div>
      </Dialog>
    </div>
  );
}
