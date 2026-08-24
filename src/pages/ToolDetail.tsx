import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import type { DepartmentId, Priority, WorkItem } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import NotFound from './NotFound';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canAccessTool } from '@/lib/toolAccess';
import { BuildingFacilitiesOperations } from '@/components/building/BuildingFacilitiesOperations';
import { BuildingFacilitiesProjects } from '@/components/building/BuildingFacilitiesProjects';
import { VehicleFleetManagement } from '@/components/fleet/VehicleFleetManagement';
import { fetchUserDirectory, updateWorkTask, type DirectoryUser } from '@/lib/api';
import { useToast } from '@/context/ToastContext';

export default function ToolDetail() {
  const { deptId, toolCode } = useParams<{ deptId: DepartmentId; toolCode: string }>();
  const { tools, workItems, createTaskFromCalendarEvent, updateWorkItem } = useData();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewOffice, previewPosition } = useRolePreview();
  const navigate = useNavigate();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ status: 'In Progress', priority: 'Normal' as Priority, dueDate: '', description: '' });
  const [savingEditTask, setSavingEditTask] = useState(false);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigneeUsername: user?.username ?? '', priority: 'Normal' as Priority, dueDate: '' });
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

  useEffect(() => {
    if (!addTaskOpen) return;
    fetchUserDirectory(token).then(setDirectoryUsers).catch(() => setDirectoryUsers([]));
  }, [addTaskOpen, token]);

  async function addToolTask() {
    if (!tool || !taskForm.title.trim() || !taskForm.assigneeUsername) return;
    setSavingTask(true);
    const result = await createTaskFromCalendarEvent({
      calendarEventId: '', title: taskForm.title.trim(), description: taskForm.description.trim() || undefined,
      assigneeUsername: taskForm.assigneeUsername, departmentId: String(deptId ?? tool.ownerDepartmentId),
      officeAssignment: user?.unitName || undefined, taskSubject: tool.taskSubjects?.[0] || tool.code,
      priority: taskForm.priority, dueDate: taskForm.dueDate || undefined,
    });
    setSavingTask(false);
    if (!result.ok) return toast({ kind: 'error', title: 'Task not created', description: result.error });
    setAddTaskOpen(false);
    setTaskForm({ title: '', description: '', assigneeUsername: user?.username ?? '', priority: 'Normal', dueDate: '' });
    toast({ kind: 'success', title: 'Task created', description: `${result.task.id} was added to this tool.` });
    openTaskModal(result.task);
  }

  function openTaskModal(task: WorkItem) {
    setSelectedTask(task);
    setEditTaskForm({ status: task.status, priority: task.priority, dueDate: task.dueDate ?? '', description: task.purpose ?? '' });
  }

  async function saveTaskChanges() {
    if (!selectedTask) return;
    setSavingEditTask(true);
    try {
      const result = await updateWorkTask(token, selectedTask.id, {
        status: editTaskForm.status,
        priority: editTaskForm.priority,
        dueDate: editTaskForm.dueDate || undefined,
        description: editTaskForm.description,
      });
      updateWorkItem(selectedTask.id, result.task);
      setSelectedTask(result.task);
      toast({ kind: 'success', title: 'Task updated', description: `${result.task.id} was saved in Oracle.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update task', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSavingEditTask(false); }
  }

  if (!tool || tool.status !== 'ENABLED' || !grant || grant.level === 'EXISTING' || !canAccessTool(tool, {
    role: effectiveRole,
    departmentCode: previewDepartmentId ?? user?.departmentCode,
    officeName: isPreviewing ? previewOffice : user?.unitName,
    positionTitle: isPreviewing ? previewPosition : user?.position,
  })) return <NotFound />;

  const hasOperations = tool.code === 'Building and Facilities Management System';
  const hasFleet = tool.code === 'Vehicle Fleet Management System';
  const tabs = [
    { value: 'tasks', label: 'Tasks', count: tasks.length },
    { value: 'records', label: 'Records' },
    ...(hasOperations ? [{ value: 'operations', label: 'Operations' }] : []),
    ...(hasOperations ? [{ value: 'projects', label: 'Projects' }] : []),
    ...(hasFleet ? [{ value: 'fleet', label: 'Fleet Operations' }] : []),
  ];
  const tabTitle = tab === 'tasks' ? 'Tasks' : tab === 'records' ? 'Records' : tab === 'operations' ? 'Operations' : tab === 'fleet' ? 'Fleet Operations' : 'Projects';
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
        deptId === 'ISD'
          ? { label: 'My Workspace', to: '/workspace' }
          : { label: `${deptId} Workspace`, to: `/workspace/preview/${deptId}` },
        { label: tool.code },
      ]} />
      <Tabs tabs={tabs} value={tab} onChange={(value) => { setTab(value); setSearch(''); }} className="mb-5" />
      <Card>
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{tool.code} {tabTitle}</CardTitle><p className="mt-1 text-sm text-slate-500">{tab === 'tasks' ? 'Tasks from My Work whose Subject exactly matches this tool’s configured Task Subjects.' : tab === 'records' ? `Operational records for ${tool.code}.` : tab === 'fleet' ? 'Manage vehicle inventory, inspection checklists, maintenance, registrations, attachments, and schedule compliance.' : 'Manage building operations, facility maintenance, space use, and service activities.'}</p></div>{tab === 'tasks' && <Button onClick={() => { setTaskForm((current) => ({ ...current, assigneeUsername: user?.username ?? current.assigneeUsername })); setAddTaskOpen(true); }}><Plus className="h-4 w-4" /> Add Task</Button>}</div></CardHeader>
        <CardContent>
          {tab === 'tasks' ? (
            <><Toolbar search={search} onSearchChange={setSearch} placeholder="Search task, control number, subject…" /><DataTable columns={columns} rows={visibleTasks} getRowId={(item) => item.id} onRowClick={openTaskModal} cardTitle={(item) => item.title} emptyTitle={`No ${tool.code} tasks`} emptyDescription={subjects.size ? 'Matching My Work tasks will appear here automatically.' : 'Configure at least one Task Subject for this tool in Administration.'} /></>
          ) : tab === 'records' ? (
            <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center"><p className="font-medium text-slate-700">{tool.recordsTable ? 'No Oracle records found' : 'Oracle table not configured'}</p><p className="mt-1 text-sm text-slate-500">{tool.recordsTable ? `Records for this tool are sourced from ${tool.recordsTable}.` : 'A BES_ISD_XXXXX Oracle table will be connected when this tool’s Records module is implemented.'}</p></div>
          ) : tab === 'fleet' ? (
            <VehicleFleetManagement />
          ) : tab === 'operations' ? (
            <BuildingFacilitiesOperations />
          ) : (
            <BuildingFacilitiesProjects />
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedTask)} onClose={() => setSelectedTask(null)} title={`Edit Task — ${selectedTask?.title ?? ''}`} description={selectedTask?.id} size="lg" footer={<><Button variant="outline" onClick={() => setSelectedTask(null)}>Close</Button><Button variant="outline" onClick={() => selectedTask && navigate(`/my-work/${encodeURIComponent(selectedTask.id)}`)}>Open in My Work</Button><Button disabled={savingEditTask} onClick={saveTaskChanges}>{savingEditTask ? 'Saving…' : 'Save Changes'}</Button></>}>
        {selectedTask && <div className="grid gap-4 text-sm sm:grid-cols-2"><div><Label>Status</Label><Select value={editTaskForm.status} onChange={(event) => setEditTaskForm((current) => ({ ...current, status: event.target.value }))}>{['In Progress', 'Completed', 'Returned', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</Select></div><div><Label>Priority</Label><Select value={editTaskForm.priority} onChange={(event) => setEditTaskForm((current) => ({ ...current, priority: event.target.value as Priority }))}>{['Low', 'Normal', 'High', 'Urgent'].map((priority) => <option key={priority}>{priority}</option>)}</Select></div><div><p className="text-xs text-slate-500">Created By</p><p className="font-medium">{selectedTask.requestorName}</p></div><div><p className="text-xs text-slate-500">Assigned To</p><p className="font-medium">{selectedTask.assigneeName || 'Unassigned'}</p></div><div><p className="text-xs text-slate-500">Subject</p><p className="font-medium">{String(selectedTask.fields.taskSubject ?? '—')}</p></div><div><Label>Due Date</Label><Input type="date" value={editTaskForm.dueDate} onChange={(event) => setEditTaskForm((current) => ({ ...current, dueDate: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Description / Progress Details</Label><Textarea className="min-h-40" value={editTaskForm.description} onChange={(event) => setEditTaskForm((current) => ({ ...current, description: event.target.value }))} /></div></div>}
      </Dialog>
      <Dialog open={addTaskOpen} onClose={() => setAddTaskOpen(false)} title={`Add Task — ${tool.code}`} description={`The subject is automatically set to ${tool.taskSubjects?.[0] || tool.code}.`} size="lg" footer={<><Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button><Button disabled={savingTask || !taskForm.title.trim() || !taskForm.assigneeUsername} onClick={addToolTask}>{savingTask ? 'Creating…' : 'Create Task'}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label required>Task Title</Label><Input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Description</Label><Textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} /></div><div><Label required>Assign To</Label><Select value={taskForm.assigneeUsername} onChange={(event) => setTaskForm((current) => ({ ...current, assigneeUsername: event.target.value }))}><option value="">Select employee</option>{directoryUsers.map((person) => <option key={person.username} value={person.username}>{person.name}</option>)}</Select></div><div><Label>Priority</Label><Select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as Priority }))}>{['Low', 'Normal', 'High', 'Urgent'].map((priority) => <option key={priority}>{priority}</option>)}</Select></div><div><Label>Due Date</Label><Input type="date" value={taskForm.dueDate} onChange={(event) => setTaskForm((current) => ({ ...current, dueDate: event.target.value }))} /></div></div>
      </Dialog>
    </div>
  );
}
