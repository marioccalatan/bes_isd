import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { isBefore, isWithinInterval, addDays, startOfDay } from 'date-fns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/input';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canSeeTeamItems, canApprove } from '@/lib/permissions';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { formatDate, processLabel } from '@/lib/utils';
import type { WorkItem, WorkStatus } from '@/lib/types';

const STATUS_OPTIONS: WorkStatus[] = ['Draft', 'Submitted', 'For Review', 'Pending Approval', 'Approved', 'Returned', 'Rejected', 'In Progress', 'Completed', 'Cancelled'];

export default function MyWork() {
  const { workItems, departments } = useData();
  const { effectiveRole } = useRolePreview();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') ?? 'tasks';
  const [tab, setTab] = useState(initialTab);
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [processFilter, setProcessFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [dueFilter, setDueFilter] = useState('All');

  const showTeamTab = canSeeTeamItems(effectiveRole);
  const showApprovalsTab = canApprove(effectiveRole);

  const myRequests = workItems.filter((w) => w.requestorId === CURRENT_EMPLOYEE.id && w.status !== 'Draft');
  const myDrafts = workItems.filter((w) => w.requestorId === CURRENT_EMPLOYEE.id && w.status === 'Draft');
  const myApprovals = workItems.filter((w) => w.status === 'Pending Approval' && w.approvalChain.some((s) => s.status === 'Pending'));
  const teamItems = workItems.filter((w) => w.isTeamItem);
  const completed = workItems.filter((w) => (w.requestorId === CURRENT_EMPLOYEE.id || w.isTeamItem) && (w.status === 'Completed' || w.status === 'Approved'));
  const myTasks = [
    ...myApprovals,
    ...workItems.filter((w) => w.requestorId === CURRENT_EMPLOYEE.id && w.status === 'Returned'),
  ];

  const tabsList = [
    { value: 'tasks', label: 'My Tasks', count: myTasks.length },
    { value: 'requests', label: 'My Requests', count: myRequests.length },
    ...(showApprovalsTab ? [{ value: 'approvals', label: 'My Approvals', count: myApprovals.length }] : []),
    ...(showTeamTab ? [{ value: 'team', label: 'Assigned to My Team', count: teamItems.length }] : []),
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
  }, [tab, workItems]);

  const filteredRows = sourceRows.filter((w) => {
    if (statusFilter !== 'All' && w.status !== statusFilter) return false;
    if (priorityFilter !== 'All' && w.priority !== priorityFilter) return false;
    if (processFilter !== 'All' && w.processType !== processFilter) return false;
    if (deptFilter !== 'All' && w.departmentId !== deptFilter) return false;
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
    (row, q) => row.id.toLowerCase().includes(q) || row.title.toLowerCase().includes(q) || row.requestorName.toLowerCase().includes(q),
    8
  );

  const processOptions = Array.from(new Set(sourceRows.map((w) => w.processType)));

  const columns: Column<WorkItem>[] = [
    { key: 'id', header: 'Reference No.', render: (w) => <span className="font-mono text-xs font-medium text-brand-700">{w.id}</span>, sortable: true },
    { key: 'title', header: 'Title', render: (w) => <span className="font-medium text-slate-800">{w.title}</span> },
    { key: 'processType', header: 'Process', render: (w) => processLabel(w.processType), hideOnCard: true },
    { key: 'requestorName', header: 'Requestor', render: (w) => w.requestorName, sortable: true },
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

  return (
    <div>
      <PageHeader title="My Work" description="A unified queue for your tasks, requests, approvals, and team activity." crumbs={[{ label: 'My Work' }]} />
      <Tabs tabs={tabsList} value={tab} onChange={handleTab} className="mb-4" />

      <Toolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search by reference number, title, or requestor…"
        onExport={() => exportToCsv(`bes-my-work-${tab}.csv`, ['Reference No.', 'Title', 'Process', 'Requestor', 'Department', 'Date Submitted', 'Priority', 'Status'], filteredRows.map((w) => [w.id, w.title, processLabel(w.processType), w.requestorName, w.departmentId, w.dateSubmitted, w.priority, w.status]))}
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
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        cardTitle={(w) => <span className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-brand-700">{w.id}</span><StatusBadge status={w.status} /></span>}
        emptyTitle="No items in this view"
        emptyDescription="Try switching tabs or adjusting your filters."
      />
      <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={8} />
    </div>
  );
}
