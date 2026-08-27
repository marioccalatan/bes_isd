import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Paperclip, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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
import { Pagination } from '@/components/ui/pagination';
import { Drawer } from '@/components/ui/drawer';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { exportToCsv } from '@/hooks/useTableControls';
import { deleteHrServiceEvidence, deleteHrServiceRecord, downloadHrServiceEvidence, fetchCsrRequests, fetchHrEmployees, fetchHrServiceRecords, fetchHroToolTaskProcessing, fetchUserDirectory, saveHrServiceRecord, updateHrEmployee, uploadHrServiceEvidence, type DirectoryUser, type HrEmployee, type HrServiceRecord, type PolicyTaskProcessing } from '@/lib/api';
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
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeFilters, setEmployeeFilters] = useState<Record<string, string>>({});
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSortKey, setEmployeeSortKey] = useState<string | null>('lastName');
  const [employeeSortDir, setEmployeeSortDir] = useState<'asc' | 'desc'>('asc');
  const [employeePage, setEmployeePage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<HrEmployee | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ lastName: '', firstName: '', middleName: '', currentPositionType: '', officialPositionType: '', positionLevel: '', dateHired: '' });
  const [employeeDialogTab, setEmployeeDialogTab] = useState('details');
  const [serviceRecords, setServiceRecords] = useState<HrServiceRecord[]>([]);
  const [serviceRecordsLoading, setServiceRecordsLoading] = useState(false);
  const [savingServiceRecord, setSavingServiceRecord] = useState(false);
  const [editingServiceRecordId, setEditingServiceRecordId] = useState<string | null>(null);
  const emptyServiceForm = { positionTitle: '', positionLevel: '', monthlySalary: '', effectiveStart: '', effectiveEnd: '', remarks: '' };
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);

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

  useEffect(() => {
    if (!token || module.id !== 'human-resources') return;
    let cancelled = false;
    setEmployeesLoading(true);
    fetchHrEmployees(token)
      .then((items) => { if (!cancelled) setEmployees(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load employees', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setEmployeesLoading(false); });
    return () => { cancelled = true; };
  }, [module.id, toast, token]);

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

  const employeeColumns: Column<HrEmployee>[] = [
    { key: 'employeeNo', header: 'Employee No.', sortable: true, filterable: true, render: (employee) => <span className="font-mono text-xs font-medium text-brand-700">{employee.employeeNo}</span> },
    { key: 'lastName', header: 'Last Name', sortable: true, filterable: true, render: (employee) => employee.lastName },
    { key: 'firstName', header: 'First Name', sortable: true, filterable: true, render: (employee) => employee.firstName },
    { key: 'middleName', header: 'Middle Name', sortable: true, filterable: true, render: (employee) => employee.middleName || '—' },
    { key: 'currentPositionType', header: 'Current Position', sortable: true, filterable: true, render: (employee) => employee.currentPositionType || '—' },
    { key: 'officialPositionType', header: 'Official Position', sortable: true, filterable: true, render: (employee) => employee.officialPositionType || '—' },
    { key: 'positionLevel', header: 'Level', sortable: true, filterable: true, render: (employee) => employee.positionLevel || '—' },
    { key: 'dateHired', header: 'Date Hired', sortable: true, filterable: true, render: (employee) => employee.dateHired ? formatDate(employee.dateHired) : '—' },
    { key: 'department', header: 'Department', sortable: true, filterable: true, render: (employee) => <div><p className="font-medium text-slate-800">{employee.departmentShort || employee.departmentId || '—'}</p>{employee.departmentName && <p className="mt-0.5 text-[11px] text-slate-500">{employee.departmentName}</p>}</div> },
  ];

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const generalQuery = employeeSearch.trim().toLowerCase();
    const generalMatch = !generalQuery || [employee.employeeNo, employee.lastName, employee.firstName, employee.middleName,
      employee.currentPositionType, employee.officialPositionType, employee.positionLevel, employee.dateHired, employee.departmentId, employee.departmentShort, employee.departmentName,
    ].some((value) => String(value ?? '').toLowerCase().includes(generalQuery));
    return generalMatch && employeeColumns.every((column) => {
    const filter = (employeeFilters[column.key] ?? '').trim().toLowerCase();
    if (!filter) return true;
    const value = column.key === 'department'
      ? [employee.departmentId, employee.departmentShort, employee.departmentName].filter(Boolean).join(' ')
      : String(employee[column.key as keyof HrEmployee] ?? '');
    return value.toLowerCase().includes(filter);
    });
  }).sort((left, right) => {
    if (!employeeSortKey) return 0;
    const value = (employee: HrEmployee) => employeeSortKey === 'department'
      ? employee.departmentShort ?? employee.departmentId ?? ''
      : String(employee[employeeSortKey as keyof HrEmployee] ?? '');
    return value(left).localeCompare(value(right), undefined, { numeric: true, sensitivity: 'base' }) * (employeeSortDir === 'asc' ? 1 : -1);
  }), [employeeFilters, employeeSearch, employeeSortDir, employeeSortKey, employees]);
  const employeePageSize = 25;
  const employeePageCount = Math.max(1, Math.ceil(filteredEmployees.length / employeePageSize));
  const safeEmployeePage = Math.min(employeePage, employeePageCount);
  const employeePageRows = filteredEmployees.slice((safeEmployeePage - 1) * employeePageSize, safeEmployeePage * employeePageSize);
  const employeeDepartmentCounts = useMemo(() => {
    const counts = new Map<string, { code: string; name: string; count: number }>();
    for (const employee of employees) {
      const code = employee.departmentShort || employee.departmentId || 'Unassigned';
      const name = employee.departmentName || (code === 'Unassigned' ? 'No department lookup' : code);
      const current = counts.get(code);
      if (current) current.count += 1;
      else counts.set(code, { code, name, count: 1 });
    }
    return [...counts.values()].sort((left, right) => left.code.localeCompare(right.code));
  }, [employees]);

  function toggleEmployeeSort(key: string) {
    if (employeeSortKey === key) setEmployeeSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setEmployeeSortKey(key); setEmployeeSortDir('asc'); }
    setEmployeePage(1);
  }

  function openEmployee(employee: HrEmployee) {
    setSelectedEmployee(employee);
    setEmployeeForm({
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName ?? '',
      currentPositionType: employee.currentPositionType ?? '',
      officialPositionType: employee.officialPositionType ?? '',
      positionLevel: employee.positionLevel ?? '',
      dateHired: employee.dateHired ?? '',
    });
    setEmployeeDialogTab('details');
    setServiceRecords([]);
    setEditingServiceRecordId(null);
    setServiceForm(emptyServiceForm);
  }

  useEffect(() => {
    if (!token || !selectedEmployee || employeeDialogTab !== 'service-records') return;
    let cancelled = false; setServiceRecordsLoading(true);
    fetchHrServiceRecords(token, selectedEmployee.employeeNo)
      .then((items) => { if (!cancelled) setServiceRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load service records', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setServiceRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [employeeDialogTab, selectedEmployee, toast, token]);

  function editServiceRecord(record: HrServiceRecord) {
    setEditingServiceRecordId(record.id);
    setServiceForm({ positionTitle: record.positionTitle, positionLevel: record.positionLevel ?? '', monthlySalary: record.monthlySalary == null ? '' : String(record.monthlySalary), effectiveStart: record.effectiveStart, effectiveEnd: record.effectiveEnd ?? '', remarks: record.remarks ?? '' });
  }

  async function submitServiceRecord() {
    if (!token || !selectedEmployee || !serviceForm.positionTitle.trim() || !serviceForm.effectiveStart) return;
    setSavingServiceRecord(true);
    try {
      await saveHrServiceRecord(token, selectedEmployee.employeeNo, { positionTitle: serviceForm.positionTitle.trim(), positionLevel: serviceForm.positionLevel.trim() || null, monthlySalary: serviceForm.monthlySalary ? Number(serviceForm.monthlySalary) : null, effectiveStart: serviceForm.effectiveStart, effectiveEnd: serviceForm.effectiveEnd || null, remarks: serviceForm.remarks.trim() || null }, editingServiceRecordId ?? undefined);
      setServiceRecords(await fetchHrServiceRecords(token, selectedEmployee.employeeNo)); setEditingServiceRecordId(null); setServiceForm(emptyServiceForm);
      toast({ kind: 'success', title: 'Service record saved', description: 'The employee’s historical service entry was saved.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to save service record', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingServiceRecord(false); }
  }

  async function removeServiceRecord(recordId: string) {
    if (!token) return;
    try { await deleteHrServiceRecord(token, recordId); setServiceRecords((current) => current.filter((record) => record.id !== recordId)); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete service record', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function attachServiceEvidence(recordId: string, file?: File) {
    if (!token || !file) return;
    try { const result = await uploadHrServiceEvidence(token, recordId, file); setServiceRecords((current) => current.map((record) => record.id === recordId ? { ...record, evidence: [...record.evidence, result.evidence] } : record)); toast({ kind: 'success', title: 'Evidence attached', description: file.name }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to attach evidence', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function saveEmployee() {
    if (!token || !selectedEmployee) return;
    if (!employeeForm.lastName.trim() || !employeeForm.firstName.trim()) {
      toast({ kind: 'error', title: 'Name required', description: 'Enter both the employee’s first and last name.' });
      return;
    }
    setSavingEmployee(true);
    try {
      const result = await updateHrEmployee(token, selectedEmployee.employeeNo, {
        lastName: employeeForm.lastName.trim(), firstName: employeeForm.firstName.trim(),
        middleName: employeeForm.middleName.trim() || null, currentPositionType: employeeForm.currentPositionType.trim() || null,
        officialPositionType: employeeForm.officialPositionType.trim() || null,
        positionLevel: employeeForm.positionLevel.trim() || null, dateHired: employeeForm.dateHired || null,
      });
      setEmployees((current) => current.map((employee) => employee.employeeNo === result.employee.employeeNo ? result.employee : employee));
      setSelectedEmployee(null);
      toast({ kind: 'success', title: 'Employee updated', description: `${result.employee.firstName} ${result.employee.lastName} was saved to the HR masterfile.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update employee', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSavingEmployee(false); }
  }

  return (
    <div>
      <PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} />
      {module.id !== 'member-programs' && <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {module.id === 'human-resources' ? <>
          <Card className="p-4"><p className="text-xs text-slate-500">Active Employees</p><p className="mt-1 text-2xl font-bold text-slate-900">{employees.length || '—'}</p></Card>
          <Card className="p-4 sm:col-span-2">
            <p className="text-xs font-medium text-slate-500">Employees per Department</p>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
              {employeeDepartmentCounts.map((department) => <div key={department.code} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1" title={department.name}><span className="truncate text-xs font-medium text-slate-700">{department.code}</span><span className="text-sm font-bold text-brand-700">{department.count}</span></div>)}
            </div>
          </Card>
        </> : module.stats.map((stat) => <Card key={stat.label} className="p-4"><p className="text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-xl font-bold text-slate-900">{stat.value}</p></Card>)}
      </div>}

      <Tabs
        tabs={[{ value: 'tasks', label: 'Tasks', count: tasks.length }, ...(module.id === 'member-programs' ? [{ value: 'csr', label: 'CSR', count: csrCount }, { value: 'community-relations', label: 'Community Relations', count: communityRelationsCount }, { value: 'operations', label: 'Operations' }, { value: 'programs', label: 'Programs' }] : [...(module.id === 'human-resources' ? [{ value: 'employees', label: 'Employees', count: employees.length }] : []), { value: 'records', label: 'Records', count: module.records.length }]) ]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5"
      />

      {tab === 'csr' ? <MemberProgramsCsr onCountChange={setCsrCount} /> : tab === 'community-relations' ? <MemberProgramsCsr onCountChange={setCommunityRelationsCount} programType="Linkages" title="Linkages" description="Community linkages, evaluation, project requirements, events, and funding." requestLabel="Request" /> : tab === 'operations' ? <MemberProgramsOperations /> : tab === 'programs' ? <MemberProgramsPrograms /> : tab === 'employees' ? <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div><CardTitle>Active Employees</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Current employee masterfile records joined with the department lookup.</p></div>
          <a href="/workspace/human-resources/summary" target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-surface px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><BarChart3 className="h-4 w-4" /> Summary</a>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input aria-label="Search all employee fields" value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Search all employee fields…" className="pl-9" />
              </div>
              <p className="text-xs text-slate-500">{employeesLoading ? 'Loading employees…' : `${filteredEmployees.length} of ${employees.length} active employees`}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEmployeeSearch(''); setEmployeeFilters({}); setEmployeePage(1); }}>Clear filters</Button>
              <Button variant="outline" size="sm" onClick={() => exportToCsv('active-employees.csv', ['EMPNO', 'E_LAST', 'E_FIRST', 'E_MIDDLE', 'CURRENT_POSITION_TYPE', 'OFFICIAL_POSITION_TYPE', 'POSITION_LEVEL', 'DATE_HIRED', 'DEPT_ID', 'DEPARTMENT'], filteredEmployees.map((employee) => [employee.employeeNo, employee.lastName, employee.firstName, employee.middleName ?? '', employee.currentPositionType ?? '', employee.officialPositionType ?? '', employee.positionLevel ?? '', employee.dateHired ?? '', employee.departmentId ?? '', employee.departmentName ?? '']))}>Export</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
            </div>
          </div>
          <DataTable columns={employeeColumns} rows={employeePageRows} getRowId={(employee) => employee.employeeNo} onRowClick={openEmployee} sortKey={employeeSortKey} sortDir={employeeSortDir} onSort={toggleEmployeeSort} columnFilters={employeeFilters} onColumnFilterChange={(key, value) => { setEmployeeFilters((current) => ({ ...current, [key]: value })); setEmployeePage(1); }} cardTitle={(employee) => `${employee.lastName}, ${employee.firstName}`} emptyTitle="No active employees" emptyDescription="No active employee records match the current column filters." minWidthPx={1260} />
          {!employeesLoading && <Pagination page={safeEmployeePage} pageCount={employeePageCount} onChange={setEmployeePage} total={filteredEmployees.length} pageSize={employeePageSize} />}
        </CardContent>
      </Card> : <Card>
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

      <Dialog open={!!selectedEmployee} onClose={() => { if (!savingEmployee && !savingServiceRecord) setSelectedEmployee(null); }} title="Employee Record" description={selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} · Employee ${selectedEmployee.employeeNo}` : undefined} size="xl" footer={employeeDialogTab === 'details' ? <><Button variant="outline" disabled={savingEmployee} onClick={() => setSelectedEmployee(null)}>Cancel</Button><Button disabled={savingEmployee} onClick={() => void saveEmployee()}>{savingEmployee ? 'Saving…' : 'Save Changes'}</Button></> : <Button variant="outline" onClick={() => setSelectedEmployee(null)}>Close</Button>}>
        <Tabs tabs={[{ value: 'details', label: 'Details' }, { value: 'service-records', label: 'Service Records', count: serviceRecords.length }]} value={employeeDialogTab} onChange={setEmployeeDialogTab} className="mb-5" />
        {employeeDialogTab === 'details' ? <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-first-name" required>First name</Label><Input id="employee-first-name" value={employeeForm.firstName} onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))} /></div>
            <div><Label htmlFor="employee-middle-name">Middle name</Label><Input id="employee-middle-name" value={employeeForm.middleName} onChange={(event) => setEmployeeForm((current) => ({ ...current, middleName: event.target.value }))} /></div>
          </div>
          <div><Label htmlFor="employee-last-name" required>Last name</Label><Input id="employee-last-name" value={employeeForm.lastName} onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-current-position">Current position</Label><Input id="employee-current-position" value={employeeForm.currentPositionType} onChange={(event) => setEmployeeForm((current) => ({ ...current, currentPositionType: event.target.value }))} /></div>
            <div><Label htmlFor="employee-position">Official position</Label><Input id="employee-position" value={employeeForm.officialPositionType} onChange={(event) => setEmployeeForm((current) => ({ ...current, officialPositionType: event.target.value }))} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-position-level">Position level</Label><Input id="employee-position-level" value={employeeForm.positionLevel} onChange={(event) => setEmployeeForm((current) => ({ ...current, positionLevel: event.target.value }))} /></div>
            <div><Label htmlFor="employee-date-hired">Date hired</Label><Input id="employee-date-hired" type="date" value={employeeForm.dateHired} onChange={(event) => setEmployeeForm((current) => ({ ...current, dateHired: event.target.value }))} /></div>
          </div>
        </div> : <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-800">{editingServiceRecordId ? 'Edit Service Record' : 'Add Service Record'}</p><p className="text-xs text-slate-500">Historical position, level, salary, and effectivity.</p></div>{editingServiceRecordId && <Button variant="ghost" size="sm" onClick={() => { setEditingServiceRecordId(null); setServiceForm(emptyServiceForm); }}>Cancel edit</Button>}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2"><Label required>Position</Label><Input value={serviceForm.positionTitle} onChange={(event) => setServiceForm((current) => ({ ...current, positionTitle: event.target.value }))} placeholder="Position title" /></div>
              <div><Label>Position level</Label><Input value={serviceForm.positionLevel} onChange={(event) => setServiceForm((current) => ({ ...current, positionLevel: event.target.value }))} /></div>
              <div><Label>Monthly salary</Label><Input type="number" min="0" step="0.01" value={serviceForm.monthlySalary} onChange={(event) => setServiceForm((current) => ({ ...current, monthlySalary: event.target.value }))} placeholder="0.00" /></div>
              <div><Label required>Effective start</Label><Input type="date" value={serviceForm.effectiveStart} onChange={(event) => setServiceForm((current) => ({ ...current, effectiveStart: event.target.value }))} /></div>
              <div><Label>Effective end</Label><Input type="date" value={serviceForm.effectiveEnd} onChange={(event) => setServiceForm((current) => ({ ...current, effectiveEnd: event.target.value }))} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><Label>Remarks</Label><Textarea value={serviceForm.remarks} onChange={(event) => setServiceForm((current) => ({ ...current, remarks: event.target.value }))} placeholder="Appointment, promotion, reclassification, or supporting notes" /></div>
            </div>
            <div className="mt-3 flex justify-end"><Button disabled={savingServiceRecord || !serviceForm.positionTitle.trim() || !serviceForm.effectiveStart} onClick={() => void submitServiceRecord()}><Plus className="h-4 w-4" /> {savingServiceRecord ? 'Saving…' : editingServiceRecordId ? 'Update Record' : 'Add Record'}</Button></div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-800">Service History</p>
            {serviceRecordsLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading service records…</p> : serviceRecords.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">No service records yet.</p> : <div className="space-y-3">{serviceRecords.map((record) => <div key={record.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{record.positionTitle}</p><p className="mt-0.5 text-xs text-slate-500">{record.effectiveStart} to {record.effectiveEnd || 'Present'} · Level {record.positionLevel || '—'} · {record.monthlySalary == null ? 'Salary not recorded' : `₱${record.monthlySalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</p>{record.remarks && <p className="mt-2 text-sm text-slate-600">{record.remarks}</p>}</div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Edit service record" onClick={() => editServiceRecord(record)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Delete service record" onClick={() => void removeServiceRecord(record.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>
              <div className="mt-3 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">Evidence</span>{record.evidence.map((evidence) => <span key={evidence.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"><button className="inline-flex items-center gap-1 hover:text-brand-700" onClick={() => token && void downloadHrServiceEvidence(token, evidence)}><Download className="h-3 w-3" />{evidence.fileName}</button><button aria-label={`Delete ${evidence.fileName}`} className="ml-1 text-slate-400 hover:text-red-600" onClick={() => token && void deleteHrServiceEvidence(token, evidence.id).then(() => setServiceRecords((current) => current.map((item) => item.id === record.id ? { ...item, evidence: item.evidence.filter((file) => file.id !== evidence.id) } : item)))}>×</button></span>)}<label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><Paperclip className="h-3.5 w-3.5" /> Attach file<input type="file" className="hidden" onChange={(event) => { void attachServiceEvidence(record.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div></div>
            </div>)}</div>}
          </div>
        </div>}
      </Dialog>

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
