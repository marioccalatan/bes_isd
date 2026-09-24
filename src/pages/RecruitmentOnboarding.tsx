import { recruitmentFields, type RecruitmentExtendedProfile } from '../../shared/recruitment-fields.mjs';
import { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { HroTaskProcessingDrawer } from '@/components/shared/HroTaskProcessingDrawer';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Drawer } from '@/components/ui/drawer';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { addRecruitmentComment, archiveRecruitmentTask, createRecruitmentPosition, deleteRecruitmentRecord, fetchHroToolTaskProcessing, fetchRecruitmentPositions, fetchRecruitmentRecords, updateRecruitmentRecord, type PolicyTaskProcessing } from '@/lib/api';
import type { RecruitmentRecord, RecruitmentStatus, WorkItem } from '@/lib/types';
import type { WorkspaceModuleDef } from '@/lib/workspace';
import { formatDate, formatDateTime } from '@/lib/utils';
import benecoLogo from '@/assets/brand/beneco-logo.png';

const STATUSES: RecruitmentStatus[] = [
  'Received',
  'For Screening',
  'For Interview',
  'Qualified',
  'Not Qualified',
  'Applicant Pool',
  'Hired',
  'Withdrawn',
];

type ApplicantProfile = RecruitmentExtendedProfile & Pick<RecruitmentRecord,
  'lastName' | 'firstName' | 'middleName' | 'suffix' | 'birthDate' | 'sex' | 'civilStatus' |
  'email' | 'mobileNo' | 'municipality' | 'barangay' | 'address' | 'highestEducation' |
  'schoolName' | 'yearGraduated' | 'applicationSource'>;

const EMPTY_PROFILE: ApplicantProfile = {
  ...Object.fromEntries(recruitmentFields.map(({ key }) => [key, ''])) as RecruitmentExtendedProfile,
  lastName: '', firstName: '', middleName: '', suffix: '', birthDate: '', sex: '', civilStatus: '',
  email: '', mobileNo: '', municipality: '', barangay: '', address: '', highestEducation: '',
  schoolName: '', yearGraduated: '', applicationSource: '',
};

export default function RecruitmentOnboarding({ module }: { module: WorkspaceModuleDef }) {
  const { token } = useAuth();
  const { workItems } = useData();
  const { toast } = useToast();
  const [records, setRecords] = useState<RecruitmentRecord[]>([]);
  const [tab, setTab] = useState('applications');
  const [selected, setSelected] = useState<RecruitmentRecord | null>(null);
  const [search, setSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<RecruitmentStatus>('Received');
  const [remarks, setRemarks] = useState('');
  const [comment, setComment] = useState('');
  const [positionApplying, setPositionApplying] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [processingRecords, setProcessingRecords] = useState<PolicyTaskProcessing[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [createPositionOpen, setCreatePositionOpen] = useState(false);
  const [newPosition, setNewPosition] = useState('');
  const [profile, setProfile] = useState<ApplicantProfile>(EMPTY_PROFILE);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addingApplicant, setAddingApplicant] = useState(false);
  const [archiveTaskId, setArchiveTaskId] = useState<string | null>(null);
  const [archiveProfile, setArchiveProfile] = useState<ApplicantProfile>(EMPTY_PROFILE);
  const [archiveStatus, setArchiveStatus] = useState<RecruitmentStatus>('Received');
  const [archivePosition, setArchivePosition] = useState('');
  const [archiveRemarks, setArchiveRemarks] = useState('');
  const [positionTarget, setPositionTarget] = useState<'record' | 'archive'>('record');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchRecruitmentRecords(token), fetchRecruitmentPositions(token), fetchHroToolTaskProcessing(token, module.id)])
      .then(([items, positionItems, taskProcessing]) => { if (!cancelled) { setRecords(items); setPositions(positionItems); setProcessingRecords(taskProcessing); } })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load applications', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [module.id, token, toast]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = records.filter((record) => {
      const matchesSearch = !query || [record.title, record.controlNumber, record.applicantName, record.positionApplying, record.status]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
      return matchesSearch && Object.entries(columnFilters).every(([key, filter]) => {
        let value = applicationColumnValue(record, key);
        if (key === 'title') value += ` ${record.applicantName} ${record.sourceTaskId}`;
        if (key === 'dateSubmitted') value += ` ${formatDate(record.dateSubmitted)}`;
        return value.toLowerCase().includes(filter.trim().toLowerCase());
      });
    });
    if (sortKey) filtered.sort((left, right) => {
      const leftValue = applicationColumnValue(left, sortKey);
      const rightValue = applicationColumnValue(right, sortKey);
      const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? result : -result;
    });
    return filtered;
  }, [records, search, columnFilters, sortKey, sortDir]);

  function sortApplications(key: string) {
    setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  }

  const recordsByPosition = useMemo(() => {
    const groups = new Map<string, RecruitmentRecord[]>();
    for (const record of visibleRecords) {
      const position = record.positionApplying?.trim() || 'Position Not Specified';
      groups.set(position, [...(groups.get(position) ?? []), record]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visibleRecords]);

  const sourceTasks = useMemo(
    () => workItems.filter((item) => String(item.fields.taskSubject ?? '').trim().toLowerCase() === 'application letter'),
    [workItems],
  );

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sourceTasks;
    return sourceTasks.filter((task) => [task.id, task.title, task.requestorName, task.assigneeName, task.fields.controlNumber]
      .some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [search, sourceTasks]);

  const columns: Column<RecruitmentRecord>[] = [
    {
      key: 'title', header: 'Application', render: (record) => (
        <div><p className="font-medium text-slate-800">{record.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{record.sourceTaskId}</p></div>
      ),
    },
    { key: 'controlNumber', header: 'Control No.', render: (record) => record.controlNumber ?? '—' },
    { key: 'createdBy', header: 'Created By', render: (record) => record.createdBy },
    { key: 'assignedTo', header: 'Assigned To', render: (record) => record.assignedTo },
    { key: 'positionApplying', header: 'Position Applying', render: (record) => record.positionApplying ?? '—' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (record) => formatDate(record.dateSubmitted) },
    { key: 'status', header: 'Recruitment Status', render: (record) => <Badge>{record.status}</Badge> },
  ];

  const taskColumns: Column<WorkItem>[] = [
    {
      key: 'title', header: 'Task', render: (task) => (
        <div><p className="font-medium text-slate-800">{task.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{task.id}</p></div>
      ),
    },
    { key: 'controlNumber', header: 'Control No.', render: (task) => String(task.fields.controlNumber ?? '—') },
    { key: 'createdBy', header: 'Created By', render: (task) => task.requestorName },
    { key: 'assignedTo', header: 'Assigned To', render: (task) => task.assigneeName ?? 'Unassigned' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (task) => formatDate(task.dateSubmitted) },
    { key: 'status', header: 'My Work Status', render: (task) => <StatusBadge status={task.status} /> },
    { key: 'processingStatus', header: 'Recruitment Task Status', render: (task) => <Badge>{processingRecords.find((record) => record.taskId === task.id)?.status ?? 'Received'}</Badge> },
  ];

  function openRecord(record: RecruitmentRecord) {
    setSelected(record);
    setStatus(record.status);
    setRemarks(record.remarks);
    setComment('');
    setPositionApplying(record.positionApplying ?? '');
    setProfile(profileFromRecord(record));
  }

  function replaceProcessingRecord(record: PolicyTaskProcessing) {
    setProcessingRecords((current) => current.some((item) => item.taskId === record.taskId)
      ? current.map((item) => item.taskId === record.taskId ? record : item)
      : [record, ...current]);
  }

  const selectedTask = selectedTaskId ? workItems.find((item) => item.id === selectedTaskId) ?? null : null;
  const archiveTask = archiveTaskId ? workItems.find((item) => item.id === archiveTaskId) ?? null : null;
  const selectedTaskArchived = selectedTask ? records.some((record) => record.sourceTaskId === selectedTask.id) : false;

  function replaceRecord(record: RecruitmentRecord) {
    setRecords((current) => current.map((item) => item.id === record.id ? record : item));
    setSelected(record);
    setStatus(record.status);
    setRemarks(record.remarks);
    setPositionApplying(record.positionApplying ?? '');
  }

  async function saveDetails() {
    if (!selected) return;
    setSaving(true);
    try {
      const result = await updateRecruitmentRecord(token, selected.id, {
        status,
        actionTaken: selected.actionTaken,
        positionApplying: positionApplying.trim() || undefined,
        remarks,
        ...profile,
      });
      replaceRecord(result.record);
      toast({ kind: 'success', title: 'Recruitment details updated', description: `${selected.applicantName} was updated without changing the source My Work task.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update application', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function submitComment() {
    if (!selected || !comment.trim()) return;
    setSaving(true);
    try {
      const result = await addRecruitmentComment(token, selected.id, comment.trim());
      const updated = { ...selected, comments: [...selected.comments, result.comment] };
      replaceRecord(updated);
      setComment('');
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add comment', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!selected) return;
    setSaving(true);
    try {
      const deleted = selected;
      await deleteRecruitmentRecord(token, deleted.id);
      setRecords((current) => current.filter((record) => record.id !== deleted.id));
      setSelected(null);
      setDeleteOpen(false);
      toast({
        kind: 'success',
        title: 'Application deleted',
        description: `${deleted.applicantName} was removed from Recruitment and Onboarding. The source My Work task was preserved.`,
      });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to delete application', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  function choosePosition(value: string) {
    if (value === '__create__') {
      setPositionTarget('record');
      setNewPosition('');
      setCreatePositionOpen(true);
      return;
    }
    setPositionApplying(value);
  }

  function chooseArchivePosition(value: string) {
    if (value === '__create__') {
      setPositionTarget('archive');
      setNewPosition('');
      setCreatePositionOpen(true);
      return;
    }
    setArchivePosition(value);
  }

  function beginArchiveTask(task: WorkItem) {
    setArchiveProfile(profileFromApplicantName(applicantNameFromTask(task.title)));
    setArchiveStatus('Received');
    setArchivePosition('');
    setArchiveRemarks('');
    setSelectedTaskId(null);
    setArchiveTaskId(task.id);
  }

  async function archiveTaskAsApplication() {
    if (!archiveTask && !addingApplicant) return;
    if (!archiveProfile.firstName.trim() || !archiveProfile.lastName.trim()) {
      toast({ kind: 'error', title: 'Applicant name required', description: 'Enter the applicant’s first name and last name.' });
      return;
    }
    setSaving(true);
    try {
      const result = await archiveRecruitmentTask(token, archiveTask?.id, {
        status: archiveStatus,
        positionApplying: archivePosition.trim() || undefined,
        remarks: archiveRemarks,
        ...archiveProfile,
      });
      setRecords((current) => [result.record, ...current.filter((record) => record.id !== result.record.id)]);
      setArchiveTaskId(null);
      setAddingApplicant(false);
      setSearch('');
      toast({ kind: 'success', title: addingApplicant ? 'Applicant added' : 'Application archived', description: `${result.record.applicantName} is now available in the Applications tab.` });
    } catch (error) {
      toast({ kind: 'error', title: addingApplicant ? 'Unable to add applicant' : 'Unable to archive application', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function addPosition() {
    if (!newPosition.trim()) return;
    setSaving(true);
    try {
      const result = await createRecruitmentPosition(token, newPosition.trim());
      setPositions((current) => Array.from(new Set([...current, result.positionName])).sort((a, b) => a.localeCompare(b)));
      if (positionTarget === 'archive') setArchivePosition(result.positionName);
      else setPositionApplying(result.positionName);
      setCreatePositionOpen(false);
      setNewPosition('');
      toast({ kind: 'success', title: 'Position added', description: `${result.positionName} is now reusable for other applicants.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add position', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  const positionOptions = useMemo(
    () => Array.from(new Set([...positions, ...(positionApplying ? [positionApplying] : []), ...(archivePosition ? [archivePosition] : [])])).sort((a, b) => a.localeCompare(b)),
    [archivePosition, positionApplying, positions],
  );

  const applicantPoolCount = records.filter((record) => record.status === 'Applicant Pool').length;
  const hiredCount = records.filter((record) => record.status === 'Hired').length;

  function updateProfile<K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function updateArchiveProfile<K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) {
    setArchiveProfile((current) => ({ ...current, [key]: value }));
  }

  function exportApplicationsToExcel() {
    const headers = [
      ...recruitmentFields.map(({ label }) => label),
      'Application ID', 'Application Title', 'Source Task ID', 'Control No.', 'Applicant Name',
      'Last Name', 'First Name', 'Middle Name', 'Suffix', 'Birth Date', 'Sex', 'Civil Status',
      'Email', 'Mobile Number', 'Municipality', 'Barangay', 'Complete Address',
      'Highest Educational Attainment', 'School', 'Year Graduated', 'Application Source',
      'Position Applying', 'Created By', 'Assigned To', 'Date Submitted', 'Recruitment Status',
      'Remarks', 'Action Taken', 'Comments', 'Created At', 'Updated At',
    ];
    const rows = visibleRecords.map((record) => [
      ...recruitmentFields.map(({ key }) => key === 'submittedAt' ? record[key].slice(0, 10) : record[key]),
      record.id, record.title, record.sourceTaskId, record.controlNumber ?? '', record.applicantName,
      record.lastName, record.firstName, record.middleName, record.suffix, record.birthDate, record.sex, record.civilStatus,
      record.email, record.mobileNo, record.municipality, record.barangay, record.address,
      record.highestEducation, record.schoolName, record.yearGraduated, record.applicationSource,
      record.positionApplying ?? '', record.createdBy, record.assignedTo, record.dateSubmitted, record.status,
      record.remarks, record.actionTaken ?? '', record.comments.map((item) => `${item.author}: ${item.message} (${item.createdAt})`).join(' | '), record.createdAt, record.updatedAt,
    ]);
    const cell = (value: unknown, tag: 'th' | 'td') => `<${tag}>${String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</${tag}>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>${headers.map((header) => cell(header, 'th')).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => cell(value, 'td')).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `recruitment-applications-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="no-print"><PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} /></div>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 no-print">
        <Card className="p-4"><p className="text-xs text-slate-500">Incoming Tasks</p><p className="mt-1 text-xl font-bold text-slate-900">{sourceTasks.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Applicant Pool</p><p className="mt-1 text-xl font-bold text-slate-900">{applicantPoolCount}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Hired</p><p className="mt-1 text-xl font-bold text-slate-900">{hiredCount}</p></Card>
      </div>

      <Tabs
        tabs={[
          { value: 'tasks', label: 'Tasks', count: sourceTasks.length },
          { value: 'applications', label: 'Applications', count: records.length },
        ]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5 no-print"
      />

      <Card>
        {tab === 'applications' && <div className="print-only text-slate-900">
          <div className="border-b border-slate-400 pb-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <img src={benecoLogo} alt="BENECO logo" className="h-16 w-16 object-contain" />
            <div className="text-left"><p className="text-lg font-bold">Benguet Electric Cooperative</p><p className="text-sm">BENECO Enterprise System</p><p className="text-xs">Institutional Services Department · Human Resource Office</p></div>
          </div>
          <h1 className="mt-4 text-xl font-bold">Recruitment and Onboarding — Applications</h1>
          <p className="mt-1 text-xs">Generated {new Intl.DateTimeFormat('en-PH', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}</p>
          </div>
          <div className="my-4" />
          {recordsByPosition.map(([position, applicants]) => (
            <section key={position} className="mb-5 break-inside-avoid">
              <h2 className="border-b-2 border-slate-700 pb-1 text-base font-bold">{position} <span className="text-xs font-normal">({applicants.length} applicant{applicants.length === 1 ? '' : 's'})</span></h2>
              <table className="mt-2 w-full table-fixed border-collapse text-[9px] leading-tight">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="w-[17%] border border-slate-400 p-1.5">Applicant Information</th>
                    <th className="w-[12%] border border-slate-400 p-1.5">Contact</th>
                    <th className="w-[15%] border border-slate-400 p-1.5">Address</th>
                    <th className="w-[14%] border border-slate-400 p-1.5">Education</th>
                    <th className="w-[10%] border border-slate-400 p-1.5">Application</th>
                    <th className="w-[17%] border border-slate-400 p-1.5">Remarks / Actions</th>
                    <th className="w-[15%] border border-slate-400 p-1.5">Recruitment Status</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((record, index) => (
                    <tr key={record.id} className="break-inside-avoid align-top">
                      <td className="border border-slate-400 p-1.5"><strong>{index + 1}. {record.lastName}, {[record.firstName, record.middleName, record.suffix].filter(Boolean).join(' ')}</strong><br />Birth date: {record.birthDate ? formatDate(record.birthDate) : '—'}<br />Sex: {record.sex || '—'}<br />Civil status: {record.civilStatus || '—'}</td>
                      <td className="break-words border border-slate-400 p-1.5">Email: {record.email || '—'}<br />Mobile: {record.mobileNo || '—'}</td>
                      <td className="border border-slate-400 p-1.5">Municipality: {record.municipality || '—'}<br />Barangay: {record.barangay || '—'}<br />Address: {record.address || '—'}</td>
                      <td className="border border-slate-400 p-1.5">Attainment: {record.highestEducation || '—'}<br />School: {record.schoolName || '—'}<br />Year graduated: {record.yearGraduated || '—'}</td>
                      <td className="border border-slate-400 p-1.5">Source: {record.applicationSource || '—'}<br />Date submitted: {record.dateSubmitted ? formatDate(record.dateSubmitted) : '—'}</td>
                      <td className="border border-slate-400 p-1.5">Remarks: {record.remarks || '—'}<br />Action: {record.actionTaken || '—'}</td>
                      <td className="border border-slate-400 p-1.5 font-semibold">{record.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          {visibleRecords.length === 0 && <p className="py-8 text-center text-sm">No applications match the current search.</p>}
        </div>}
        <div className={tab === 'applications' ? 'no-print' : ''}>
        <CardHeader>
          <CardTitle>{tab === 'tasks' ? 'Application Letter Tasks' : 'Applications'}</CardTitle>
          <p className="text-sm text-slate-500">{tab === 'tasks'
            ? 'Live tasks from My Work whose subject is Application Letter. Opening one here uses HRO actions only.'
            : 'Recruitment-owned records stored in BES_HRO_RECRUITMENT_AND_ONBOARDING.'}</p>
        </CardHeader>
        <CardContent>
          <div className="no-print"><Toolbar search={search} onSearchChange={setSearch} placeholder={tab === 'tasks' ? 'Search task, control number, creator…' : 'Search applicant, control number, position, status…'} onExport={tab === 'applications' ? exportApplicationsToExcel : undefined} onPrint={tab === 'applications' ? () => window.print() : undefined} exportLabel="Export to Excel">
            {tab === 'applications' && <Button size="sm" onClick={() => {
              setArchiveTaskId(null);
              setArchiveProfile({ ...EMPTY_PROFILE });
              setArchiveStatus('Received');
              setArchivePosition('');
              setArchiveRemarks('');
              setAddingApplicant(true);
            }}><Plus className="h-4 w-4" aria-hidden="true" /> Add Applicants</Button>}
            {tab === 'applications' && Object.values(columnFilters).some(value => value.trim()) && <Button variant="ghost" size="sm" onClick={() => setColumnFilters({})}>Clear column filters</Button>}
          </Toolbar></div>
          {tab === 'tasks' ? (
            <DataTable
                columns={taskColumns}
                rows={visibleTasks}
                getRowId={(task) => task.id}
                onRowClick={(task) => setSelectedTaskId(task.id)}
                cardTitle={(task) => task.title}
                emptyTitle="No Application Letter tasks"
                emptyDescription="My Work tasks with the subject Application Letter will appear here automatically."
              />
          ) : (
            <DataTable
              columns={columns.map(column => ({ ...column, sortable: true, filterable: true }))}
              rows={visibleRecords}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={sortApplications}
              columnFilters={columnFilters}
              onColumnFilterChange={(key, value) => setColumnFilters(current => ({ ...current, [key]: value }))}
              getRowId={(record) => record.id}
              onRowClick={openRecord}
              cardTitle={(record) => record.title}
              emptyTitle={loading ? 'Loading applications…' : 'No applications yet'}
              emptyDescription={loading ? 'Reading Recruitment and Onboarding records from Oracle.' : 'Application Letter tasks will be registered here automatically.'}
            />
          )}
        </CardContent>
        </div>
      </Card>

      <HroTaskProcessingDrawer
        open={!!selectedTask}
        task={selectedTask}
        moduleId={module.id}
        moduleName={module.name}
        processing={selectedTask ? processingRecords.find((record) => record.taskId === selectedTask.id) : undefined}
        onClose={() => setSelectedTaskId(null)}
        onSaved={replaceProcessingRecord}
        onArchive={selectedTask && !selectedTaskArchived ? () => beginArchiveTask(selectedTask) : undefined}
      />

      <Dialog
        open={!!archiveTask || addingApplicant}
        onClose={() => { if (!saving) { setArchiveTaskId(null); setAddingApplicant(false); } }}
        title={addingApplicant ? 'Add Applicant' : 'Archive Application'}
        size="xl"
        footer={<>
          <Button variant="outline" onClick={() => { setArchiveTaskId(null); setAddingApplicant(false); }} disabled={saving}>Cancel</Button>
          <Button onClick={archiveTaskAsApplication} disabled={saving}>{saving ? 'Saving…' : addingApplicant ? 'Add Applicant' : 'Archive Application'}</Button>
        </>}
      >
        {(archiveTask || addingApplicant) && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
              {archiveTask ? <><p className="font-medium text-slate-800">{archiveTask.title}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <p>Source task: <span className="font-mono text-slate-700">{archiveTask.id}</span></p>
                <p>Control no.: <span className="text-slate-700">{String(archiveTask.fields.controlNumber ?? '—')}</span></p>
              </div>
              <p className="mt-2 text-xs text-slate-400">Complete the applicant information below. Saving creates the Recruitment and Onboarding application while preserving the source task.</p></> : <p>Enter the applicant’s details. Saving also creates a linked Application Letter task assigned to you.</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><h3 className="font-semibold text-slate-900">Application Processing</h3></div>
              <div><Label>Recruitment Status</Label><Select value={archiveStatus} onChange={(event) => setArchiveStatus(event.target.value as RecruitmentStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></div>
              <div><Label>Position Applying</Label><Select value={archivePosition} onChange={(event) => chooseArchivePosition(event.target.value)}><option value="">Select position</option>{positionOptions.map((item) => <option key={item} value={item}>{item}</option>)}<option value="__create__">＋ Create New</option></Select></div>
              <div className="sm:col-span-2"><Label>Remarks</Label><Textarea value={archiveRemarks} onChange={(event) => setArchiveRemarks(event.target.value)} placeholder="Initial recruitment remarks" /></div>
              <div className="sm:col-span-2 border-t border-slate-200 pt-4"><h3 className="font-semibold text-slate-900">Applicant Information</h3><p className="mt-1 text-xs text-slate-500">First name and last name are required.</p></div>
              <ApplicantProfileFields profile={archiveProfile} onChange={updateArchiveProfile} />
            </div>
          </div>
        )}
      </Dialog>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.applicantName ?? 'Application'} widthClass="max-w-2xl">
        {selected && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
              <p className="font-medium text-slate-800">{selected.title}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <p>Source task: <span className="font-mono text-slate-700">{selected.sourceTaskId}</span></p>
                <p>Control no.: <span className="text-slate-700">{selected.controlNumber ?? '—'}</span></p>
                <p>Created by: <span className="text-slate-700">{selected.createdBy}</span></p>
                <p>Assigned to: <span className="text-slate-700">{selected.assignedTo}</span></p>
              </div>
              <p className="mt-2 text-xs text-slate-400">Source information is view-only in this workspace.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><h3 className="font-semibold text-slate-900">Application Processing</h3></div>
              <div><Label>Recruitment Status</Label><Select value={status} onChange={(event) => setStatus(event.target.value as RecruitmentStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></div>
              <div><Label>Position Applying</Label><Select value={positionApplying} onChange={(event) => choosePosition(event.target.value)}><option value="">Select position</option>{positionOptions.map((item) => <option key={item} value={item}>{item}</option>)}<option value="__create__">＋ Create New</option></Select></div>
              <div className="sm:col-span-2"><Label>Remarks</Label><Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Recruitment assessment, follow-up, or processing remarks" /></div>
              <div className="sm:col-span-2 border-t border-slate-200 pt-4">
                <h3 className="font-semibold text-slate-900">Applicant Information</h3>
                <p className="mt-1 text-xs text-slate-500">Maintain the applicant’s standard recruitment profile in Oracle. First name and last name are required.</p>
              </div>
              <ApplicantProfileFields profile={profile} onChange={updateProfile} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveDetails} disabled={saving}><Save className="h-4 w-4" /> Save Details</Button>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={saving}><Trash2 className="h-4 w-4" /> Delete</Button>
            </div>

            {selected.actionTaken && (
              <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-3 text-sm">
                <p className="font-medium text-brand-800">Action Taken: {selected.actionTaken}</p>
                {selected.positionApplying && <p className="mt-1 text-brand-700">Position: {selected.positionApplying}</p>}
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900">Recruitment Comments</h3>
              <div className="mt-3 space-y-3">
                {selected.comments.length === 0 && <p className="text-sm text-slate-500">No recruitment comments yet.</p>}
                {selected.comments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-800">{item.author}</span><span className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</span></div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{item.message}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1"><Label>Add Comment</Label><Textarea className="min-h-20" value={comment} onChange={(event) => setComment(event.target.value)} /></div>
                <Button size="icon" onClick={submitComment} disabled={saving || !comment.trim()} aria-label="Add recruitment comment"><MessageSquarePlus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => { if (!saving) setDeleteOpen(false); }}
        onConfirm={confirmDelete}
        title="Delete application?"
        description={`Remove ${selected?.applicantName ?? 'this applicant'} from Recruitment and Onboarding? Its source My Work task will not be deleted.`}
        confirmLabel={saving ? 'Deleting…' : 'Delete Application'}
        destructive
      />

      <Dialog
        open={createPositionOpen}
        onClose={() => { if (!saving) setCreatePositionOpen(false); }}
        title="Create New Position"
        description="Add a reusable Position Applying option for Recruitment and Onboarding."
        footer={<><Button variant="outline" onClick={() => setCreatePositionOpen(false)} disabled={saving}>Cancel</Button><Button onClick={addPosition} disabled={saving || !newPosition.trim()}>{saving ? 'Adding…' : 'Add Position'}</Button></>}
      >
        <div><Label required>Position Name</Label><Input value={newPosition} onChange={(event) => setNewPosition(event.target.value)} placeholder="e.g. Mechanic" autoFocus /></div>
      </Dialog>
    </div>
  );
}

function applicationColumnValue(record: RecruitmentRecord, key: string): string {
  switch (key) {
    case 'title': return record.title;
    case 'controlNumber': return record.controlNumber ?? '—';
    case 'createdBy': return record.createdBy;
    case 'assignedTo': return record.assignedTo;
    case 'positionApplying': return record.positionApplying ?? '—';
    case 'dateSubmitted': return record.dateSubmitted ?? '';
    case 'status': return record.status;
    default: return '';
  }
}

function profileFromRecord(record: RecruitmentRecord): ApplicantProfile {
  if (record.firstName || record.lastName) {
    return {
      ...Object.fromEntries(recruitmentFields.map(({ key }) => [key, record[key] ?? ''])) as RecruitmentExtendedProfile,
      lastName: record.lastName,
      firstName: record.firstName,
      middleName: record.middleName,
      suffix: record.suffix,
      birthDate: record.birthDate,
      sex: record.sex,
      civilStatus: record.civilStatus,
      email: record.email,
      mobileNo: record.mobileNo,
      municipality: record.municipality,
      barangay: record.barangay,
      address: record.address,
      highestEducation: record.highestEducation,
      schoolName: record.schoolName,
      yearGraduated: record.yearGraduated,
      applicationSource: record.applicationSource,
    };
  }
  return profileFromApplicantName(record.applicantName);
}

function applicantNameFromTask(title: string) {
  return title.replace(/^application\s+letter\s+(?:of|from)\s+/i, '').trim();
}

function profileFromApplicantName(name: string): ApplicantProfile {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    ...EMPTY_PROFILE,
    firstName: parts.shift() ?? '',
    lastName: parts.pop() ?? '',
    middleName: parts.join(' '),
  };
}

function ApplicantProfileFields({
  profile,
  onChange,
}: {
  profile: ApplicantProfile;
  onChange: <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) => void;
}) {
  return (
    <>
      <div><Label required>Last Name</Label><Input value={profile.lastName} onChange={(event) => onChange('lastName', event.target.value)} /></div>
      <div><Label required>First Name</Label><Input value={profile.firstName} onChange={(event) => onChange('firstName', event.target.value)} /></div>
      <div><Label>Middle Name</Label><Input value={profile.middleName} onChange={(event) => onChange('middleName', event.target.value)} /></div>
      <div><Label>Suffix</Label><Input value={profile.suffix} onChange={(event) => onChange('suffix', event.target.value)} placeholder="e.g. Jr., III" /></div>
      <div><Label>Application Source</Label><Select value={profile.applicationSource} onChange={(event) => onChange('applicationSource', event.target.value)}><option value="">Select</option><option>Walk-in</option><option>Employee Referral</option><option>Job Portal</option><option>Social Media</option><option>Job Fair</option><option>Other</option><option>Online Application Form</option></Select></div>
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="applicant-submittedAt">Original Submission Date</Label><Input id="applicant-submittedAt" type="date" value={profile.submittedAt.slice(0, 10)} onChange={(event) => onChange('submittedAt', event.target.value)} /></div>
        <div><Label htmlFor="applicant-originalFullName">Full Name as Submitted</Label><Input id="applicant-originalFullName" value={profile.originalFullName} maxLength={2000} onChange={(event) => onChange('originalFullName', event.target.value)} /></div>
      </div>
      <ExtendedApplicantFields profile={profile} onChange={onChange} />
    </>
  );
}

function PersonalApplicantFields({ profile, onChange }: { profile: ApplicantProfile; onChange: <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) => void }) {
  return <>
      <div><Label>Birth Date</Label><Input type="date" value={profile.birthDate} onChange={(event) => onChange('birthDate', event.target.value)} /></div>
      <div><Label>Sex</Label><Select value={profile.sex} onChange={(event) => onChange('sex', event.target.value)}><option value="">Select</option><option>Female</option><option>Male</option><option>Prefer not to say</option></Select></div>
      <div><Label>Civil Status</Label><Select value={profile.civilStatus} onChange={(event) => onChange('civilStatus', event.target.value)}><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option><option>Annulled</option></Select></div>
      <div><Label>Email</Label><Input type="email" value={profile.email} onChange={(event) => onChange('email', event.target.value)} /></div>
      <div><Label>Mobile Number</Label><Input value={profile.mobileNo} onChange={(event) => onChange('mobileNo', event.target.value)} /></div>
      <div><Label>Residential Municipality</Label><Input value={profile.municipality} onChange={(event) => onChange('municipality', event.target.value)} /></div>
      <div><Label>Residential Barangay</Label><Input value={profile.barangay} onChange={(event) => onChange('barangay', event.target.value)} /></div>
      <div className="sm:col-span-2"><Label>Residential Address</Label><Input value={profile.address} onChange={(event) => onChange('address', event.target.value)} /></div>
  </>;
}

function ExtendedApplicantFields({ profile, onChange }: { profile: ApplicantProfile; onChange: <K extends keyof ApplicantProfile>(key: K, value: ApplicantProfile[K]) => void }) {
  const [section, setSection] = useState('Personal Details');
  const sections = Array.from(new Set(recruitmentFields.map(field => field.section))).filter(value => value !== 'Source');
  return <div className="min-w-0 sm:col-span-2 space-y-3">
    <Tabs tabs={sections.map(value => ({ value, label: value }))} value={section} onChange={setSection} className="flex-wrap overflow-visible" />
    <section role="tabpanel" aria-label={section} className="rounded-lg border border-slate-200 p-3">
      {section === 'Education History' && <p className="mt-2 text-xs text-slate-500">Keep the degree or strand and school details below. Select the graduation month and year for each level when known.</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {section === 'Personal Details' && <PersonalApplicantFields profile={profile} onChange={onChange} />}
        {section === 'Education History' && <>
          <div><Label htmlFor="applicant-highestEducation">Highest Educational Attainment</Label><Input id="applicant-highestEducation" value={profile.highestEducation} onChange={(event) => onChange('highestEducation', event.target.value)} placeholder="e.g. Bachelor’s Degree" /></div>
          <div><Label htmlFor="applicant-schoolName">School</Label><Input id="applicant-schoolName" value={profile.schoolName} onChange={(event) => onChange('schoolName', event.target.value)} /></div>
          <div><Label htmlFor="applicant-yearGraduated">Year Graduated</Label><Input id="applicant-yearGraduated" inputMode="numeric" maxLength={4} value={profile.yearGraduated} onChange={(event) => onChange('yearGraduated', event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
        </>}
        {recruitmentFields.filter(field => field.section === section).map(field => (
        <div key={field.key} className={field.input === 'textarea' || field.key === 'permanentAddress' ? 'sm:col-span-2' : ''}>
          <Label htmlFor={'applicant-' + field.key}>{field.label}</Label>
          {field.input === 'textarea'
            ? <Textarea id={'applicant-' + field.key} value={profile[field.key]} maxLength={2000} onChange={event => onChange(field.key, event.target.value)} />
            : field.input === 'select-month'
              ? <Select id={'applicant-' + field.key} value={profile[field.key]} onChange={event => onChange(field.key, event.target.value)}><option value="">Select month</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={String(index + 1).padStart(2, '0')}>{new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, index, 1))}</option>)}</Select>
              : field.input === 'select-year'
                ? <Select id={'applicant-' + field.key} value={profile[field.key]} onChange={event => onChange(field.key, event.target.value)}><option value="">Select year</option>{Array.from(new Set([...(profile[field.key] ? [profile[field.key]] : []), ...Array.from({ length: new Date().getFullYear() - 1900 + 6 }, (_, index) => String(new Date().getFullYear() + 5 - index))])).sort((a, b) => Number(b) - Number(a)).map(year => <option key={year} value={year}>{year}</option>)}</Select>
                : <Input id={'applicant-' + field.key} type={field.input} value={field.input === 'date' ? profile[field.key].slice(0, 10) : profile[field.key]} maxLength={2000} onChange={event => onChange(field.key, event.target.value)} />}
          {section === 'Supporting Documents' && (profile[field.key].match(/https?:\/\/[^\s,]+/g) ?? []).map((url, index) => <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-sm text-brand-700 underline">Open document {index + 1}</a>)}
        </div>
      ))}</div>
    </section>
  </div>;
}
