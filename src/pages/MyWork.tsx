import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isBefore, isWithinInterval, addDays, startOfDay } from 'date-fns';
import { ChevronDown, MessageSquarePlus, Paperclip, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { useToast } from '@/context/ToastContext';
import { canSeeTeamItems, canApprove } from '@/lib/permissions';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { formatDate, processLabel } from '@/lib/utils';
import { fetchUserDirectory, type DirectoryUser } from '@/lib/api';
import { loadState, saveState } from '@/lib/storage';
import { MUNICIPALITIES, MUNICIPALITY_BARANGAYS } from '@/lib/locations';
import type { Priority, WorkItem, WorkStatus } from '@/lib/types';

const STATUS_OPTIONS: WorkStatus[] = ['Draft', 'Submitted', 'For Review', 'Pending Approval', 'Approved', 'Returned', 'Rejected', 'In Progress', 'Completed', 'Cancelled'];
const OFFICE_ASSIGNMENTS = [
  'General Services Office',
  'Materials and Equipment Management Office',
  'Community Relations Office',
  'Human Resource Office',
];
const OFFICE_SUBJECTS: Record<string, string[]> = {
  'Human Resource Office': [
    'Application Letter',
    'Policy Related',
    'Resignation Letter',
    'Compliance',
    'Memorandum',
  ],
};
const CREATE_NEW_SUBJECT = '__CREATE_NEW_SUBJECT__';
const CUSTOM_SUBJECTS_KEY = 'my-work-custom-office-subjects';

function safeAttachmentName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_') || 'attachment';
}

function directoryDisplayName(person: DirectoryUser) {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.name;
}

export default function MyWork() {
  const { workItems, departments, createTaskFromCalendarEvent, addComment } = useData();
  const { user, token, username } = useAuth();
  const { effectiveRole, previewDepartmentId } = useRolePreview();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeDepartmentId = previewDepartmentId ?? user?.departmentCode;
  const initialTab = searchParams.get('tab') ?? (activeDepartmentId ? 'team' : 'tasks');
  const [tab, setTab] = useState(initialTab);
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [processFilter, setProcessFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [officeFilter, setOfficeFilter] = useState('All');
  const [dueFilter, setDueFilter] = useState('All');
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskControlNumber, setTaskControlNumber] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignee, setTaskAssignee] = useState(user?.username ?? '');
  const [taskDepartment, setTaskDepartment] = useState(user?.departmentCode ?? '');
  const [taskOfficeAssignments, setTaskOfficeAssignments] = useState<string[]>([]);
  const [taskSubject, setTaskSubject] = useState('');
  const [customSubjectDraft, setCustomSubjectDraft] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [customOfficeSubjects, setCustomOfficeSubjects] = useState<Record<string, string[]>>(() => loadState(CUSTOM_SUBJECTS_KEY, () => ({})));
  const [taskPriority, setTaskPriority] = useState<Priority>('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [officeDropdownOpen, setOfficeDropdownOpen] = useState(false);
  const officeDropdownRef = useRef<HTMLDivElement>(null);
  const [taskAttachments, setTaskAttachments] = useState<string[]>([]);
  const [taskAttachmentDragging, setTaskAttachmentDragging] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [taskMunicipality, setTaskMunicipality] = useState('');
  const [taskBarangay, setTaskBarangay] = useState('');
  const [taskAddress, setTaskAddress] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [quickCommentItem, setQuickCommentItem] = useState<WorkItem | null>(null);
  const [quickCommentDraft, setQuickCommentDraft] = useState('');
  const [savingQuickComment, setSavingQuickComment] = useState(false);

  const showTeamTab = Boolean(activeDepartmentId) || canSeeTeamItems(effectiveRole);
  const showApprovalsTab = canApprove(effectiveRole);
  const canCreateTask = canApprove(effectiveRole);
  const myIds = new Set([user?.username, user?.employeeNo, CURRENT_EMPLOYEE.id].filter(Boolean).map(String));
  const oracleWorkItems = workItems.filter((w) => w.processType === 'task-assignment');
  const subjectOptions = Array.from(new Set(taskOfficeAssignments.flatMap((office) => [
    ...(OFFICE_SUBJECTS[office] ?? []),
    ...(customOfficeSubjects[office] ?? []),
  ])));
  const taskOfficeAssignment = taskOfficeAssignments.join(', ');
  const officeSelectionLabel = taskOfficeAssignments.length === 0
    ? 'Select office assignment'
    : taskOfficeAssignments.length === 1
      ? taskOfficeAssignments[0]
      : `${taskOfficeAssignments.length} offices selected`;
  const barangayOptions = taskMunicipality ? MUNICIPALITY_BARANGAYS[taskMunicipality] ?? [] : [];

  useEffect(() => {
    if (!taskOpen || !token) return;
    fetchUserDirectory(token)
      .then((users) => {
        setDirectoryUsers(users);
        if (!taskAssignee && users.length) setTaskAssignee(user?.username ?? users[0].username);
      })
      .catch((error) => {
        console.warn('Unable to load Oracle users for task creation.', error);
        toast({ kind: 'error', title: 'Users not loaded', description: 'Unable to load the Oracle employee directory.' });
      });
  }, [taskOpen, token, taskAssignee, user?.username, toast]);

  useEffect(() => {
    if (!officeDropdownOpen) return;
    function closeOfficeDropdown(event: PointerEvent) {
      if (!officeDropdownRef.current?.contains(event.target as Node)) setOfficeDropdownOpen(false);
    }
    document.addEventListener('pointerdown', closeOfficeDropdown);
    return () => document.removeEventListener('pointerdown', closeOfficeDropdown);
  }, [officeDropdownOpen]);

  useEffect(() => {
    if (taskSubject && !subjectOptions.includes(taskSubject)) setTaskSubject('');
  }, [subjectOptions, taskSubject]);

  const myRequests = oracleWorkItems.filter((w) => myIds.has(w.requestorId) && w.status !== 'Draft');
  const myDrafts = oracleWorkItems.filter((w) => myIds.has(w.requestorId) && w.status === 'Draft');
  const myApprovals = oracleWorkItems.filter((w) => w.status === 'Pending Approval' && w.approvalChain.some((s) => s.status === 'Pending'));
  const assignedToMe = oracleWorkItems.filter((w) => w.assigneeId && myIds.has(w.assigneeId) && !['Completed', 'Approved', 'Cancelled', 'Rejected'].includes(w.status));
  const hasEnterpriseTeamScope = effectiveRole === 'Administrator' || effectiveRole === 'General Manager';
  const departmentScopedItems = showTeamTab
    ? oracleWorkItems.filter((w) => hasEnterpriseTeamScope || (!!activeDepartmentId && w.departmentId === activeDepartmentId))
    : [];
  const teamItems = departmentScopedItems.filter((w) => !['Completed', 'Approved', 'Cancelled', 'Rejected'].includes(w.status));
  const departmentScopedItemIds = new Set(departmentScopedItems.map((w) => w.id));
  const completed = oracleWorkItems.filter((w) => (myIds.has(w.requestorId) || (w.assigneeId && myIds.has(w.assigneeId)) || departmentScopedItemIds.has(w.id)) && (w.status === 'Completed' || w.status === 'Approved'));
  const myTasks = [
    ...assignedToMe,
    ...myApprovals,
    ...oracleWorkItems.filter((w) => myIds.has(w.requestorId) && w.status === 'Returned'),
  ];

  const tabsList = [
    { value: 'tasks', label: 'My Tasks', count: myTasks.length },
    { value: 'requests', label: 'My Requests', count: myRequests.length },
    ...(showApprovalsTab ? [{ value: 'approvals', label: 'My Approvals', count: myApprovals.length }] : []),
    ...(showTeamTab ? [{ value: 'team', label: 'Department Tasks', count: teamItems.length }] : []),
    { value: 'completed', label: 'Completed', count: completed.length },
    { value: 'drafts', label: 'Drafts', count: myDrafts.length },
  ];

  const sourceRows: WorkItem[] = useMemo(() => {
    switch (tab) {
      case 'requests': return myRequests;
      case 'approvals': return myApprovals;
      case 'team': return teamItems;
      case 'completed': return completed;
      case 'drafts': return myDrafts;
      default: return myTasks;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, oracleWorkItems]);

  const filteredRows = sourceRows.filter((w) => {
    if (statusFilter !== 'All' && w.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && w.priority !== priorityFilter) return false;
    if (processFilter !== 'All' && w.processType !== processFilter) return false;
    if (deptFilter !== 'All' && w.departmentId !== deptFilter) return false;
    if (officeFilter !== 'All' && !String(w.fields.officeAssignment ?? '').split(',').map((office) => office.trim()).includes(officeFilter)) return false;
    if (dueFilter !== 'All') {
      if (!w.dueDate) return false;
      const due = startOfDay(new Date(w.dueDate));
      const today = startOfDay(new Date());
      if (dueFilter === 'Overdue' && !isBefore(due, today)) return false;
      if (dueFilter === 'This Week' && !isWithinInterval(due, { start: today, end: addDays(today, 7) })) return false;
    }
    return true;
  });

  const { search, setSearch, sortKey, sortDir, toggleSort, page, setPage, pageCount, pageRows, filteredCount } = useTableControls(
    filteredRows,
    (row, q) => row.id.toLowerCase().includes(q)
      || row.title.toLowerCase().includes(q)
      || row.requestorName.toLowerCase().includes(q)
      || (row.assigneeName ?? '').toLowerCase().includes(q)
      || String(row.fields.controlNumber ?? '').toLowerCase().includes(q)
      || String(row.fields.officeAssignment ?? '').toLowerCase().includes(q)
      || String(row.fields.taskSubject ?? '').toLowerCase().includes(q),
    8
  );

  const processOptions = Array.from(new Set(sourceRows.map((w) => w.processType)));
  const officeOptions = Array.from(new Set([
    ...OFFICE_ASSIGNMENTS,
    ...oracleWorkItems.flatMap((w) => String(w.fields.officeAssignment ?? '').split(',').map((office) => office.trim()).filter(Boolean)),
  ])).sort((a, b) => a.localeCompare(b));

  const columns: Column<WorkItem>[] = [
    { key: 'id', header: 'Reference No.', render: (w) => <span className="font-mono text-xs font-medium text-brand-700">{w.id}</span>, sortable: true },
    { key: 'title', header: 'Title', render: (w) => <span className="font-medium text-slate-800">{w.title}</span> },
    { key: 'controlNumber', header: 'Control No.', render: (w) => String(w.fields.controlNumber ?? '—'), hideOnCard: true },
    { key: 'processType', header: 'Process', render: (w) => processLabel(w.processType), hideOnCard: true },
    { key: 'requestorName', header: 'Created By', render: (w) => w.requestorName, sortable: true },
    { key: 'assigneeName', header: 'Assignee', render: (w) => w.assigneeName ?? '—', hideOnCard: true },
    { key: 'officeAssignment', header: 'Office', render: (w) => String(w.fields.officeAssignment ?? '—'), hideOnCard: true },
    { key: 'taskSubject', header: 'Subject', render: (w) => String(w.fields.taskSubject ?? '—'), hideOnCard: true },
    { key: 'departmentId', header: 'Dept.', render: (w) => <Badge>{w.departmentId}</Badge>, hideOnCard: true },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (w) => formatDate(w.dateSubmitted), sortable: true },
    { key: 'priority', header: 'Priority', render: (w) => <PriorityBadge priority={w.priority} /> },
    { key: 'status', header: 'Status', render: (w) => <StatusBadge status={w.status} /> },
  ];

  function handleTab(v: string) {
    setTab(v);
    setSearchParams({ tab: v });
    setPage(1);
  }

  function openNewTask() {
    setTaskTitle('');
    setTaskControlNumber('');
    setTaskDescription('');
    setTaskAssignee(user?.username ?? '');
    setTaskDepartment(user?.departmentCode ?? '');
    setTaskOfficeAssignments([]);
    setOfficeDropdownOpen(false);
    setTaskSubject('');
    setCustomSubjectDraft('');
    setCreatingSubject(false);
    setTaskPriority('Normal');
    setTaskDueDate('');
    setTaskAttachments([]);
    setTaskAttachmentDragging(false);
    setLocationOpen(false);
    setTaskMunicipality('');
    setTaskBarangay('');
    setTaskAddress('');
    setTaskOpen(true);
  }

  function toggleTaskOffice(office: string, checked: boolean) {
    setTaskOfficeAssignments((current) => {
      const next = checked ? [...current, office] : current.filter((item) => item !== office);
      return OFFICE_ASSIGNMENTS.filter((item) => next.includes(item));
    });
    setCreatingSubject(false);
    setCustomSubjectDraft('');
  }

  function handleSubjectChange(value: string) {
    if (value === CREATE_NEW_SUBJECT) {
      setCreatingSubject(true);
      setTaskSubject('');
      return;
    }
    setCreatingSubject(false);
    setTaskSubject(value);
  }

  function addCustomSubject() {
    const nextSubject = customSubjectDraft.trim();
    if (!taskOfficeAssignment) {
      toast({ kind: 'error', title: 'Office required', description: 'Select an office before adding a subject.' });
      return;
    }
    if (!nextSubject) {
      toast({ kind: 'error', title: 'Subject required', description: 'Enter the subject name to add.' });
      return;
    }
    if (subjectOptions.some((subject) => subject.toLowerCase() === nextSubject.toLowerCase())) {
      setTaskSubject(subjectOptions.find((subject) => subject.toLowerCase() === nextSubject.toLowerCase()) ?? nextSubject);
      setCreatingSubject(false);
      setCustomSubjectDraft('');
      return;
    }
    const next = {
      ...customOfficeSubjects,
      ...Object.fromEntries(taskOfficeAssignments.map((office) => [office, [...(customOfficeSubjects[office] ?? []), nextSubject]])),
    };
    setCustomOfficeSubjects(next);
    saveState(CUSTOM_SUBJECTS_KEY, next);
    setTaskSubject(nextSubject);
    setCreatingSubject(false);
    setCustomSubjectDraft('');
    toast({ kind: 'success', title: 'Subject added', description: `${nextSubject} added under ${taskOfficeAssignment}.` });
  }

  function addTaskAttachmentFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    setTaskAttachments((current) => {
      const next = [...current];
      incoming.forEach((file) => {
        const name = safeAttachmentName(file.name);
        if (!next.includes(name)) next.push(name);
      });
      return next;
    });
  }

  function handleTaskAttachmentInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addTaskAttachmentFiles(event.target.files);
    event.target.value = '';
  }

  function handleTaskAttachmentDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setTaskAttachmentDragging(false);
    addTaskAttachmentFiles(event.dataTransfer.files);
  }

  async function submitNewTask() {
    if (!taskTitle.trim()) {
      toast({ kind: 'error', title: 'Task title required', description: 'Enter a short title for the work to be assigned.' });
      return;
    }
    if (!taskAssignee) {
      toast({ kind: 'error', title: 'Assignee required', description: 'Select who should receive this task.' });
      return;
    }
    setSavingTask(true);
    const result = await createTaskFromCalendarEvent({
      calendarEventId: '',
      controlNumber: taskControlNumber.trim() || undefined,
      title: taskTitle.trim(),
      description: taskDescription.trim() || undefined,
      assigneeUsername: taskAssignee,
      departmentId: taskDepartment || undefined,
      officeAssignment: taskOfficeAssignment || undefined,
      taskSubject: taskSubject || undefined,
      attachments: taskAttachments,
      municipality: taskMunicipality || undefined,
      barangay: taskBarangay || undefined,
      address: taskAddress.trim() || undefined,
      priority: taskPriority,
      dueDate: taskDueDate || undefined,
    });
    setSavingTask(false);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Task not created', description: result.error });
      return;
    }
    toast({ kind: 'success', title: 'Task created', description: `${result.task.id} assigned to ${result.task.assigneeName}.` });
    setTaskOpen(false);
    navigate(`/my-work/${result.task.id}`);
  }

  function openQuickComment(row: WorkItem, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setQuickCommentItem(row);
    setQuickCommentDraft('');
  }

  async function submitQuickComment() {
    if (!quickCommentItem) return;
    const message = quickCommentDraft.trim();
    if (!message) {
      toast({ kind: 'error', title: 'Comment required', description: 'Type a comment before saving.' });
      return;
    }
    const author = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || CURRENT_EMPLOYEE.name;
    const authorId = user?.username || username;
    setSavingQuickComment(true);
    const result = await addComment(quickCommentItem.id, author, message, authorId);
    setSavingQuickComment(false);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Comment not saved', description: result.error });
      return;
    }
    toast({ kind: 'success', title: 'Comment added', description: `Quick comment saved to ${quickCommentItem.id}.` });
    setQuickCommentItem(null);
    setQuickCommentDraft('');
  }

  return (
    <div>
      <PageHeader
        title="My Work"
        description="Oracle-backed queue for assigned tasks, requests, approvals, and team activity."
        crumbs={[{ label: 'My Work' }]}
        actions={canCreateTask ? <Button onClick={openNewTask}><Plus className="h-4 w-4" /> New Task</Button> : undefined}
      />
      <Tabs tabs={tabsList} value={tab} onChange={handleTab} className="mb-4" />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by reference number, control number, title, creator, assignee, office, or subject…"
        onExport={() => exportToCsv(`bes-my-work-${tab}.csv`, ['Reference No.', 'Control No.', 'Title', 'Process', 'Created By', 'Assignee', 'Office Assignment', 'Subject', 'Department', 'Date Submitted', 'Priority', 'Status'], filteredRows.map((w) => [w.id, String(w.fields.controlNumber ?? ''), w.title, processLabel(w.processType), w.requestorName, w.assigneeName ?? '', String(w.fields.officeAssignment ?? ''), String(w.fields.taskSubject ?? ''), w.departmentId, w.dateSubmitted, w.priority, w.status]))}
        onPrint={() => window.print()}
      >
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by status">
          <option value="All">All Statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by priority">
          <option value="All">All Priorities</option>
          <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
        </Select>
        <Select value={processFilter} onChange={(e) => { setProcessFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by process">
          <option value="All">All Processes</option>
          {processOptions.map((p) => <option key={p} value={p}>{processLabel(p)}</option>)}
        </Select>
        <Select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by department">
          <option value="All">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.shortName}</option>)}
        </Select>
        <Select value={officeFilter} onChange={(e) => { setOfficeFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by office assignment">
          <option value="All">All Offices</option>
          {officeOptions.map((office) => <option key={office} value={office}>{office}</option>)}
        </Select>
        <Select value={dueFilter} onChange={(e) => { setDueFilter(e.target.value); setPage(1); }} className="w-auto" aria-label="Filter by due date">
          <option value="All">Any Due Date</option>
          <option value="Overdue">Overdue</option>
          <option value="This Week">Due This Week</option>
        </Select>
      </Toolbar>

      <DataTable
        columns={columns}
        rows={pageRows}
        getRowId={(w) => w.id}
        onRowClick={(w) => navigate(`/my-work/${w.id}`)}
        onRowContextMenu={openQuickComment}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        cardTitle={(w) => <span className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-brand-700">{w.id}</span><StatusBadge status={w.status} /></span>}
        emptyTitle="No items in this view"
        emptyDescription="No Oracle work items found. Supervisors and managers can convert calendar events into assignable tasks."
      />
      <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={8} />

      <Dialog
        open={!!quickCommentItem}
        onClose={() => {
          if (savingQuickComment) return;
          setQuickCommentItem(null);
          setQuickCommentDraft('');
        }}
        title="Quick Comment"
        description={quickCommentItem ? `Add a comment to ${quickCommentItem.id} without opening the task.` : undefined}
        size="sm"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setQuickCommentItem(null);
                setQuickCommentDraft('');
              }}
              disabled={savingQuickComment}
            >
              Cancel
            </Button>
            <Button onClick={submitQuickComment} disabled={savingQuickComment || !quickCommentDraft.trim()}>
              <MessageSquarePlus className="h-4 w-4" /> {savingQuickComment ? 'Saving…' : 'Add Comment'}
            </Button>
          </>
        )}
      >
        {quickCommentItem && (
          <div className="grid gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Task</p>
              <p className="mt-1 font-medium text-slate-800">{quickCommentItem.title}</p>
              <p className="mt-1 font-mono text-xs text-brand-700">{quickCommentItem.id}</p>
            </div>
            <div>
              <Label htmlFor="quick-comment">Comment</Label>
              <Textarea
                id="quick-comment"
                value={quickCommentDraft}
                onChange={(event) => setQuickCommentDraft(event.target.value)}
                placeholder="Type your quick comment…"
                className="min-h-[110px]"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-500">Right-click a task row anytime to add another quick comment.</p>
          </div>
        )}
      </Dialog>

      <Dialog
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title="New Task"
        description="Create an Oracle-backed work task and assign it to an employee."
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setTaskOpen(false)} disabled={savingTask}>Cancel</Button>
            <Button onClick={submitNewTask} disabled={savingTask}><Plus className="h-4 w-4" /> {savingTask ? 'Creating…' : 'Create Task'}</Button>
          </>
        )}
      >
        <div className="grid gap-4">
          <div>
            <Label htmlFor="task-title" required>Task title</Label>
            <Input id="task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="e.g. Prepare monthly report attachments" />
          </div>
          <div>
            <Label htmlFor="task-control-number">Control number</Label>
            <Input id="task-control-number" value={taskControlNumber} onChange={(e) => setTaskControlNumber(e.target.value)} placeholder="e.g. ISD-HR-2026-0001" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="task-assignee" required>Assign to</Label>
              <Select id="task-assignee" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                <option value="">Select employee</option>
                {directoryUsers.map((person) => (
                  <option key={person.username} value={person.username}>
                    {directoryDisplayName(person)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-department">Department</Label>
              <Select id="task-department" value={taskDepartment} onChange={(e) => setTaskDepartment(e.target.value)}>
                <option value="">Use my department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Office assignment</Label>
              <div ref={officeDropdownRef} className="relative mt-1">
                <button
                  type="button"
                  onClick={() => setOfficeDropdownOpen((open) => !open)}
                  className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-surface px-3 py-2 text-left text-sm text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  aria-expanded={officeDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <span className={taskOfficeAssignments.length ? 'truncate' : 'truncate text-slate-400'}>{officeSelectionLabel}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${officeDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {officeDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-md border border-slate-200 bg-surface p-2 shadow-lg">
                    <div className="grid gap-1.5">
                      {OFFICE_ASSIGNMENTS.map((office) => (
                        <label key={office} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                          <Checkbox checked={taskOfficeAssignments.includes(office)} onChange={(event) => toggleTaskOffice(office, event.target.checked)} />
                          {office}
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={() => { setTaskOfficeAssignments([]); setTaskSubject(''); setCreatingSubject(false); }}>
                        Clear
                      </button>
                      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOfficeDropdownOpen(false)}>
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {taskOfficeAssignments.length > 1 && <p className="mt-1 text-xs text-slate-500">{taskOfficeAssignments.join(', ')}</p>}
            </div>
            <div>
              <Label htmlFor="task-subject">Subject</Label>
              <Select id="task-subject" value={creatingSubject ? CREATE_NEW_SUBJECT : taskSubject} onChange={(e) => handleSubjectChange(e.target.value)} disabled={taskOfficeAssignments.length === 0}>
                <option value="">{taskOfficeAssignments.length ? 'Select subject' : 'Select office first'}</option>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                {taskOfficeAssignments.length > 0 && <option value={CREATE_NEW_SUBJECT}>+ Create new subject…</option>}
              </Select>
              {taskOfficeAssignments.length > 1 && <p className="mt-1 text-xs text-slate-500">Subjects are merged from all selected offices.</p>}
              {creatingSubject && (
                <div className="mt-2 flex gap-2">
                  <Input
                    value={customSubjectDraft}
                    onChange={(e) => setCustomSubjectDraft(e.target.value)}
                    placeholder="Enter new subject"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCustomSubject();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addCustomSubject}>Add</Button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="task-priority">Priority</Label>
              <Select id="task-priority" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Priority)}>
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
                <option>Urgent</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-due-date">Due date</Label>
              <Input id="task-due-date" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="task-description">Instructions / notes</Label>
            <Textarea id="task-description" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Add the work instructions, expected output, links, or context." />
          </div>
          <div>
            <button type="button" onClick={() => setLocationOpen((open) => !open)} className="text-sm font-semibold text-brand-700 hover:underline">
              {locationOpen ? 'Hide optional location details' : 'Add optional location details'}
            </button>
            {locationOpen && (
              <div className="mt-2 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="task-municipality">Municipality</Label>
                  <Select id="task-municipality" value={taskMunicipality} onChange={(e) => { setTaskMunicipality(e.target.value); setTaskBarangay(''); }}>
                    <option value="">Select municipality</option>
                    {MUNICIPALITIES.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="task-barangay">Barangay</Label>
                  <Select id="task-barangay" value={taskBarangay} onChange={(e) => setTaskBarangay(e.target.value)} disabled={!taskMunicipality}>
                    <option value="">{taskMunicipality ? 'Select barangay' : 'Select municipality first'}</option>
                    {barangayOptions.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="task-address">Address</Label>
                  <Input id="task-address" value={taskAddress} onChange={(e) => setTaskAddress(e.target.value)} placeholder="House no., street, purok, landmark, or other address details" />
                </div>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="task-files">Attachments</Label>
            <label
              htmlFor="task-files"
              onDragOver={(event) => { event.preventDefault(); setTaskAttachmentDragging(true); }}
              onDragLeave={() => setTaskAttachmentDragging(false)}
              onDrop={handleTaskAttachmentDrop}
              className={`mt-1 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors ${
                taskAttachmentDragging ? 'border-brand-400 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <Paperclip className="h-5 w-5 text-slate-400" />
              <span className="mt-1 text-sm font-medium text-slate-700">Drag and drop files here</span>
              <span className="text-xs text-slate-500">or choose files to attach to this task</span>
              <span className="mt-2 rounded border border-slate-300 bg-surface px-3 py-1.5 text-xs font-medium text-slate-700">Choose Files</span>
              <Input id="task-files" type="file" multiple onChange={handleTaskAttachmentInput} className="sr-only" />
            </label>
            <p className="mt-1 text-xs text-slate-500">Files will be organized under the task folder after saving.</p>
            {taskAttachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {taskAttachments.map((attachment) => (
                  <li key={attachment} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                    <span className="min-w-0 truncate text-slate-600">{attachment}</span>
                    <button type="button" onClick={() => setTaskAttachments((current) => current.filter((item) => item !== attachment))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${attachment}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="rounded-lg border border-gold-500/30 bg-gold-500/10 p-3 text-xs text-gold-700">
            Calendar-related work can also be created from an event using “Convert to Task,” which keeps the source event linked.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
