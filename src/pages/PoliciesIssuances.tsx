import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Download, FileText, MessageSquarePlus, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Drawer } from '@/components/ui/drawer';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import {
  createPolicyRecord,
  deletePolicyRecord,
  deletePolicyRecordAttachment,
  downloadPolicyRecordAttachment,
  fetchPolicyRecords,
  fetchPolicyTaskProcessing,
  previewPolicyRecordAttachment,
  uploadPolicyRecordAttachment,
  updatePolicyRecord,
  updatePolicyTaskProcessing,
  type PolicyTaskProcessing,
  type PolicyTaskStatus,
  type PolicyRecordInput,
} from '@/lib/api';
import type { Comment, PolicyDocumentType, PolicyRecord, PolicyRecordNature, PolicyRecordStatus, WorkItem } from '@/lib/types';
import type { WorkspaceModuleDef } from '@/lib/workspace';
import { exportToCsv, useTableControls } from '@/hooks/useTableControls';
import { formatDate, formatDateTime } from '@/lib/utils';

const NATURES: PolicyRecordNature[] = [
  'Financial',
  'Human Resources',
  'Legal and Compliance',
  'Public Relations',
  'Operations',
];
const DOCUMENT_TYPES: PolicyDocumentType[] = ['Policy', 'Issuance', 'Guidelines'];
const POLICY_STATUSES: PolicyRecordStatus[] = ['Effective', 'New (Draft)', 'Amended (Draft)', 'Amended', 'Rescinded'];

// Matches any all-caps heading line (e.g. "PURPOSE:", "IMPLEMENTING GUIDELINES:", "PART I -- SCOPE:") rather than a
// fixed keyword list, since the source policy documents use many different section headings, always written this way.
const POLICY_SECTION_PATTERN = "[A-Z][A-Z0-9()&/'-]+(?:[ \\t]+[A-Z0-9()&/'-]+)*";

type PolicyContentBlock = { heading?: string; body: string; provision?: boolean };

function formatPolicyContents(contents: string): PolicyContentBlock[] {
  const separated = contents
    .replace(/\r\n?/g, '\n')
    .replace(new RegExp(`\\s+(?=(${POLICY_SECTION_PATTERN})\\s*:)`, 'gi'), '\n\n')
    .trim();

  return separated.split(/\n{2,}/).flatMap((section) => {
    const match = section.trim().match(new RegExp(`^(${POLICY_SECTION_PATTERN})\\s*:\\s*([\\s\\S]*)$`, 'i'));
    if (!match) return [{ body: section.trim() }];
    const heading = `${match[1].toUpperCase()}:`;
    const body = match[2].trim();
    if (!/^POLIC(?:Y|IES):$/i.test(heading) || !/^1\.\s/.test(body)) return [{ heading, body }];
    const provisions = body.split(/\s+(?=\d+\.\s)/).filter(Boolean);
    return provisions.map((provision, index) => ({ heading: index === 0 ? heading : undefined, body: provision, provision: true }));
  });
}
const POLICY_TASK_STATUSES: PolicyTaskStatus[] = ['Received', 'Under Review', 'For Approval', 'Approved', 'Issued', 'Completed', 'Returned'];

const EMPTY_FORM: PolicyRecordInput = {
  title: '',
  documentNumber: '',
  revisionNumber: '',
  effectivityDate: '',
  contents: '',
  nature: 'Human Resources',
  documentType: 'Policy',
  status: 'Effective',
};

export default function PoliciesIssuances({ module }: { module: WorkspaceModuleDef }) {
  const { token, user } = useAuth();
  const { workItems, addComment } = useData();
  const { toast } = useToast();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState<PolicyRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PolicyRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PolicyRecordInput>(EMPTY_FORM);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentDragging, setAttachmentDragging] = useState(false);
  const [confirmRemoveAttachment, setConfirmRemoveAttachment] = useState(false);
  const [removingAttachment, setRemovingAttachment] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PolicyRecord | null>(null);
  const [processingRecords, setProcessingRecords] = useState<PolicyTaskProcessing[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<PolicyTaskStatus>('Received');
  const [actionTaken, setActionTaken] = useState('');
  const [taskComment, setTaskComment] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setRecordsLoading(true);
    fetchPolicyRecords(token)
      .then((items) => { if (!cancelled) setRecords(items); })
      .catch((error) => {
        if (!cancelled) toast({ kind: 'error', title: 'Unable to load policy records', description: error instanceof Error ? error.message : 'Please try again.' });
      })
      .finally(() => { if (!cancelled) setRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [token, toast]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchPolicyTaskProcessing(token)
      .then((items) => { if (!cancelled) setProcessingRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load policy task details', description: error instanceof Error ? error.message : 'Please try again.' }); });
    return () => { cancelled = true; };
  }, [token, toast]);

  const policyTasks = useMemo(
    () => workItems.filter((item) => String(item.fields.taskSubject ?? '').trim().toLowerCase() === 'policy related'),
    [workItems],
  );

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return policyTasks;
    return policyTasks.filter((task) => [task.id, task.title, task.requestorName, task.assigneeName, task.fields.controlNumber]
      .some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [policyTasks, search]);

  const matchesRecordSearch = (record: PolicyRecord, query: string) => [record.title, record.documentNumber, record.revisionNumber, record.documentType, record.status, record.nature, record.contents]
    .some((value) => String(value ?? '').toLowerCase().includes(query));
  const {
    search: recordSearch, setSearch: setRecordSearch,
    page: recordPage, setPage: setRecordPage, pageCount: recordPageCount,
    pageRows: recordPageRows, filteredCount: recordFilteredCount,
  } = useTableControls(records, matchesRecordSearch, 20);

  const taskColumns: Column<WorkItem>[] = [
    {
      key: 'title', header: 'Policy Task', render: (task) => (
        <div><p className="font-medium text-slate-800">{task.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{task.id}</p></div>
      ),
    },
    { key: 'controlNumber', header: 'Control No.', render: (task) => String(task.fields.controlNumber ?? '—') },
    { key: 'requestorName', header: 'Created By', render: (task) => task.requestorName },
    { key: 'assigneeName', header: 'Assigned To', render: (task) => task.assigneeName ?? 'Unassigned' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (task) => formatDate(task.dateSubmitted) },
    { key: 'status', header: 'My Work Status', render: (task) => <StatusBadge status={task.status} /> },
    { key: 'processingStatus', header: 'Policy Status', render: (task) => <Badge>{processingRecords.find((record) => record.taskId === task.id)?.status ?? 'Received'}</Badge> },
  ];

  const selectedTask = selectedTaskId ? workItems.find((item) => item.id === selectedTaskId) ?? null : null;

  function openPolicyTask(task: WorkItem) {
    const processing = processingRecords.find((record) => record.taskId === task.id);
    setSelectedTaskId(task.id);
    setTaskStatus(processing?.status ?? 'Received');
    setActionTaken(processing?.actionTaken ?? '');
    setTaskComment('');
  }

  async function savePolicyTaskDetails() {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const result = await updatePolicyTaskProcessing(token, selectedTask.id, { status: taskStatus, actionTaken });
      setProcessingRecords((current) => current.some((item) => item.taskId === result.record.taskId)
        ? current.map((item) => item.taskId === result.record.taskId ? result.record : item)
        : [result.record, ...current]);
      toast({ kind: 'success', title: 'Policy task updated', description: 'The workspace processing details were saved without changing the source task fields.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update policy task', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function addSharedTaskComment() {
    if (!selectedTask || !taskComment.trim()) return;
    setSaving(true);
    const result = await addComment(selectedTask.id, user?.name ?? user?.username ?? 'User', taskComment.trim(), user?.username);
    setSaving(false);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Unable to add comment', description: result.error });
      return;
    }
    setTaskComment('');
    toast({ kind: 'success', title: 'Comment added', description: 'This comment is also visible in My Work.' });
  }

  const recordColumns: Column<PolicyRecord>[] = [
    { key: 'title', header: 'Title', render: (record) => <span className="font-medium text-slate-800">{record.title}</span> },
    { key: 'documentNumber', header: 'Document No.', render: (record) => <span className="font-mono text-xs">{record.documentNumber}</span> },
    { key: 'documentType', header: 'Document Type', render: (record) => <Badge>{record.documentType}</Badge> },
    { key: 'policyStatus', header: 'Status', render: (record) => <Badge>{record.status}</Badge> },
    { key: 'revisionNumber', header: 'Revision', render: (record) => record.revisionNumber },
    { key: 'effectivityDate', header: 'Effectivity Date', render: (record) => record.effectivityDate ? formatDate(record.effectivityDate) : '—' },
    { key: 'nature', header: 'Nature', render: (record) => <Badge>{record.nature}</Badge> },
    {
      key: 'attachmentName',
      header: 'Attachment',
      render: (record) => record.attachmentName ? (
        <button
          type="button"
          className="text-left text-brand-700 underline-offset-2 hover:underline"
          title="Open attachment preview in a new tab"
          onClick={(event) => {
            event.stopPropagation();
            void previewAttachment(record);
          }}
        >
          {record.attachmentName}
        </button>
      ) : '—',
    },
  ];

  function updateForm<K extends keyof PolicyRecordInput>(key: K, value: PolicyRecordInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseAttachment(files: FileList | File[]) {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length !== 1) {
      toast({ kind: 'error', title: 'One DOCX file only', description: 'Each policy record can contain exactly one attachment. Drop or choose a single DOCX file.' });
      return;
    }
    const file = selectedFiles[0];
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast({ kind: 'error', title: 'DOCX required', description: 'Only Microsoft Word .docx files can be stored in the policy library.' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast({ kind: 'error', title: 'Attachment is too large', description: 'Select a DOCX file that is 25 MB or smaller.' });
      return;
    }
    setAttachment(file);
  }

  function dropAttachment(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setAttachmentDragging(false);
    if (event.dataTransfer.files.length) chooseAttachment(event.dataTransfer.files);
  }

  function openCreate() {
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setAttachment(null);
    setCreateOpen(true);
  }

  function openEdit(record: PolicyRecord) {
    setEditingRecord(record);
    setForm({
      title: record.title,
      documentNumber: record.documentNumber,
      revisionNumber: record.revisionNumber,
      effectivityDate: record.effectivityDate,
      contents: record.contents,
      nature: record.nature,
      documentType: record.documentType,
      status: record.status,
    });
    setAttachment(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    if (saving) return;
    setCreateOpen(false);
    setEditingRecord(null);
    setForm(EMPTY_FORM);
    setAttachment(null);
  }

  async function saveRecord() {
    if (!form.title.trim() || !form.documentNumber.trim() || !form.revisionNumber.trim() || !form.contents.trim()) {
      toast({ kind: 'error', title: 'Complete the policy record', description: 'All fields except the attachment are required.' });
      return;
    }
    if (attachment && !attachment.name.toLowerCase().endsWith('.docx')) {
      toast({ kind: 'error', title: 'DOCX required', description: 'Only Microsoft Word .docx files can be stored in the policy library.' });
      return;
    }
    if (attachment && attachment.size > 25 * 1024 * 1024) {
      toast({ kind: 'error', title: 'Attachment is too large', description: 'Select a DOCX file that is 25 MB or smaller.' });
      return;
    }
    setSaving(true);
    try {
      const payload: PolicyRecordInput = {
        ...form,
        originalDocumentNumber: editingRecord?.documentNumber,
      };
      const result = editingRecord
        ? await updatePolicyRecord(token, editingRecord.id, payload)
        : await createPolicyRecord(token, payload);
      if (attachment) {
        const uploaded = await uploadPolicyRecordAttachment(token, result.record.id, attachment);
        result.record.attachmentName = uploaded.attachmentName;
        result.record.attachmentMimeType = uploaded.attachmentMimeType;
        result.record.attachmentSize = uploaded.attachmentSize;
      }
      setRecords((current) => editingRecord
        ? current.map((record) => record.id === result.record.id ? result.record : record)
        : [result.record, ...current]);
      setSelectedRecord(result.record);
      toast({
        kind: 'success',
        title: editingRecord ? 'Policy record updated' : 'Policy record added',
        description: `${result.record.documentNumber} was saved successfully.`,
      });
      setCreateOpen(false);
      setEditingRecord(null);
      setForm(EMPTY_FORM);
      setAttachment(null);
    } catch (error) {
      toast({ kind: 'error', title: editingRecord ? 'Unable to update policy record' : 'Unable to add policy record', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function removeAttachment() {
    if (!editingRecord) return;
    setRemovingAttachment(true);
    try {
      await deletePolicyRecordAttachment(token, editingRecord.id);
      const clearAttachment = (record: PolicyRecord): PolicyRecord => ({
        ...record,
        attachmentName: undefined,
        attachmentMimeType: undefined,
        attachmentSize: undefined,
      });
      setRecords((current) => current.map((record) => record.id === editingRecord.id ? clearAttachment(record) : record));
      setEditingRecord((current) => current ? clearAttachment(current) : current);
      setSelectedRecord((current) => current && current.id === editingRecord.id ? clearAttachment(current) : current);
      toast({ kind: 'success', title: 'Attachment removed', description: `${editingRecord.documentNumber} no longer has a DOCX attachment.` });
      setConfirmRemoveAttachment(false);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to remove attachment', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setRemovingAttachment(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deletePolicyRecord(token, deleteTarget.id);
      setRecords((current) => current.filter((record) => record.id !== deleteTarget.id));
      if (selectedRecord?.id === deleteTarget.id) setSelectedRecord(null);
      toast({ kind: 'success', title: 'Policy record deleted', description: `${deleteTarget.documentNumber} was removed from the active policy register.` });
      setDeleteTarget(null);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to delete policy record', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function downloadAttachment(record: PolicyRecord) {
    if (!record.attachmentName) return;
    try {
      await downloadPolicyRecordAttachment(token, record.id, record.attachmentName);
    } catch (error) {
      toast({ kind: 'error', title: 'Download failed', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  }

  async function previewAttachment(record: PolicyRecord) {
    if (!record.attachmentName) return;
    try {
      await previewPolicyRecordAttachment(token, record.id);
    } catch (error) {
      toast({ kind: 'error', title: 'Preview failed', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  }

  return (
    <div>
      <PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {module.stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={[
          { value: 'tasks', label: 'Tasks', count: policyTasks.length },
          { value: 'records', label: 'Records', count: records.length },
        ]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5"
      />

      {tab === 'tasks' ? (
        <Card>
          <CardHeader>
            <CardTitle>Policy Related Tasks</CardTitle>
            <p className="text-sm text-slate-500">Live My Work tasks whose subject is Policy Related.</p>
          </CardHeader>
          <CardContent>
            <Toolbar search={search} onSearchChange={setSearch} placeholder="Search policy tasks…" />
            <DataTable
              columns={taskColumns}
              rows={visibleTasks}
              getRowId={(task) => task.id}
              onRowClick={openPolicyTask}
              cardTitle={(task) => task.title}
              emptyTitle="No policy-related tasks"
              emptyDescription="My Work tasks with the subject Policy Related will appear here automatically."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Policy Records</CardTitle>
                <p className="mt-1 text-sm text-slate-500">Controlled policy, issuance, and guideline records stored in Oracle.</p>
              </div>
              <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Record</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Toolbar
              search={recordSearch}
              onSearchChange={setRecordSearch}
              placeholder="Search title, document number, type, nature…"
              onExport={() => exportToCsv('policy-records.csv', ['Title', 'Document Number', 'Document Type', 'Status', 'Revision Number', 'Effectivity Date', 'Nature', 'Attachment'], records.map((record) => [record.title, record.documentNumber, record.documentType, record.status, record.revisionNumber, record.effectivityDate, record.nature, record.attachmentName ?? '']))}
              onPrint={() => window.print()}
            />
            <DataTable
              columns={recordColumns}
              rows={recordPageRows}
              getRowId={(record) => record.id}
              onRowClick={setSelectedRecord}
              cardTitle={(record) => record.title}
              emptyTitle={recordsLoading ? 'Loading policy records…' : 'No policy records yet'}
              emptyDescription={recordsLoading ? 'Reading the Oracle policy register.' : 'Select Add Record to create the first policy record.'}
            />
            <Pagination page={recordPage} pageCount={recordPageCount} onChange={setRecordPage} total={recordFilteredCount} pageSize={20} />
          </CardContent>
        </Card>
      )}

      <Dialog
        open={createOpen}
        onClose={closeCreate}
        title={editingRecord ? 'Edit Policy Record' : 'Add Policy Record'}
        description={editingRecord ? `Update ${editingRecord.documentNumber} and optionally replace its DOCX.` : 'Create a controlled record in the Oracle policy register.'}
        size="lg"
        footer={<><Button variant="outline" onClick={closeCreate} disabled={saving}>Cancel</Button><Button onClick={saveRecord} disabled={saving}>{saving ? 'Saving…' : editingRecord ? 'Save Changes' : 'Save Record'}</Button></>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label required>Title</Label><Input value={form.title} onChange={(event) => updateForm('title', event.target.value)} /></div>
          <div><Label required>Document Number</Label><Input value={form.documentNumber} onChange={(event) => updateForm('documentNumber', event.target.value)} placeholder="e.g. HR-POL-2026-001" /></div>
          <div><Label required>Document Type</Label><Select value={form.documentType} onChange={(event) => updateForm('documentType', event.target.value as PolicyDocumentType)}>{DOCUMENT_TYPES.map((documentType) => <option key={documentType}>{documentType}</option>)}</Select></div>
          <div><Label required>Status</Label><Select value={form.status} onChange={(event) => updateForm('status', event.target.value as PolicyRecordStatus)}>{POLICY_STATUSES.map((status) => <option key={status}>{status}</option>)}</Select></div>
          <div><Label required>Revision Number</Label><Input value={form.revisionNumber} onChange={(event) => updateForm('revisionNumber', event.target.value)} placeholder="e.g. 1 or Rev. A" /></div>
          <div><Label>Effectivity Date</Label><Input type="date" value={form.effectivityDate} onChange={(event) => updateForm('effectivityDate', event.target.value)} /></div>
          <div><Label required>Nature</Label><Select value={form.nature} onChange={(event) => updateForm('nature', event.target.value as PolicyRecordNature)}>{NATURES.map((nature) => <option key={nature}>{nature}</option>)}</Select></div>
          <div className="sm:col-span-2"><Label required>Contents</Label><Textarea className="min-h-36" value={form.contents} onChange={(event) => updateForm('contents', event.target.value)} placeholder="Enter the policy summary, scope, provisions, or controlled contents." /></div>
          <div className="sm:col-span-2">
            <Label>Attachment File</Label>
            <div className="relative">
              <label
                onDragEnter={(event) => { event.preventDefault(); setAttachmentDragging(true); }}
                onDragOver={(event) => { event.preventDefault(); setAttachmentDragging(true); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setAttachmentDragging(false); }}
                onDrop={dropAttachment}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${attachmentDragging ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-300 bg-slate-50/40 hover:border-brand-400 hover:bg-brand-50/30'}`}
              >
                <FileText className="mb-2 h-6 w-6 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{attachment ? attachment.name : editingRecord?.attachmentName ? `Current: ${editingRecord.attachmentName}` : 'Choose a DOCX policy document'}</span>
                <span className="mt-1 text-xs text-slate-500">Drag and drop one DOCX here, or click to choose. Stored as an Oracle BLOB. Maximum 25 MB.</span>
                <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { if (event.target.files?.length) chooseAttachment(event.target.files); event.target.value = ''; }} />
              </label>
              {!attachment && editingRecord?.attachmentName && (
                <button
                  type="button"
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); setConfirmRemoveAttachment(true); }}
                  className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      <Drawer open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={selectedRecord?.title ?? ''} contentClassName="overflow-hidden">
        {selectedRecord && (
          <div className="flex h-full min-h-0 flex-col gap-5 text-sm">
            <div className="flex shrink-0 flex-wrap gap-2"><Badge>{selectedRecord.documentType}</Badge><Badge>{selectedRecord.status}</Badge><Badge>{selectedRecord.nature}</Badge><Badge>Revision {selectedRecord.revisionNumber}</Badge></div>
            <dl className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div><dt className="text-xs text-slate-500">Document Number</dt><dd className="mt-0.5 font-mono font-medium text-slate-800">{selectedRecord.documentNumber}</dd></div>
              <div><dt className="text-xs text-slate-500">Document Type</dt><dd className="mt-0.5 font-medium text-slate-800">{selectedRecord.documentType}</dd></div>
              <div><dt className="text-xs text-slate-500">Effectivity Date</dt><dd className="mt-0.5 font-medium text-slate-800">{selectedRecord.effectivityDate ? formatDate(selectedRecord.effectivityDate) : 'Not set'}</dd></div>
              <div><dt className="text-xs text-slate-500">Created By</dt><dd className="mt-0.5 font-medium text-slate-800">{selectedRecord.createdBy ?? 'System baseline'}</dd></div>
              <div><dt className="text-xs text-slate-500">Last Updated</dt><dd className="mt-0.5 font-medium text-slate-800">{formatDate(selectedRecord.updatedAt)}</dd></div>
            </dl>
            <div className="flex min-h-0 flex-1 flex-col">
              <p className="shrink-0 text-xs text-slate-500">Contents</p>
              <div className="mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/30 p-3 pr-2 text-slate-700 scrollbar-thin">
                {formatPolicyContents(selectedRecord.contents).map((block, index) => (
                  <p key={`${block.heading ?? 'paragraph'}-${index}`} className={`whitespace-pre-wrap leading-6 ${block.provision ? 'pl-5 [text-indent:-1.25rem]' : ''}`}>
                    {block.heading && <strong className="mb-1 block font-semibold text-slate-900">{block.heading}</strong>}
                    {block.body}
                  </p>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-200 pt-4">
              {selectedRecord.attachmentName && <Button variant="outline" onClick={() => downloadAttachment(selectedRecord)}><Download className="h-4 w-4" /> Download {selectedRecord.attachmentName}</Button>}
              <Button onClick={() => openEdit(selectedRecord)}><Pencil className="h-4 w-4" /> Edit Record</Button>
              <Button variant="destructive" onClick={() => setDeleteTarget(selectedRecord)}><Trash2 className="h-4 w-4" /> Delete</Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer open={!!selectedTask} onClose={() => setSelectedTaskId(null)} title={selectedTask?.title ?? 'Policy Task'} widthClass="max-w-2xl">
        {selectedTask && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
              <p className="font-medium text-slate-800">Source My Work task</p>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div><dt className="text-slate-500">Task ID</dt><dd className="font-mono text-slate-700">{selectedTask.id}</dd></div>
                <div><dt className="text-slate-500">Control No.</dt><dd className="text-slate-700">{String(selectedTask.fields.controlNumber ?? '—')}</dd></div>
                <div><dt className="text-slate-500">Created By</dt><dd className="text-slate-700">{selectedTask.requestorName}</dd></div>
                <div><dt className="text-slate-500">Assigned To</dt><dd className="text-slate-700">{selectedTask.assigneeName ?? 'Unassigned'}</dd></div>
              </dl>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{selectedTask.purpose || 'No task description.'}</p>
              <p className="mt-2 text-xs text-slate-400">Source task fields are view-only in Policies and Issuances.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label required>Policy Status</Label><Select value={taskStatus} onChange={(event) => setTaskStatus(event.target.value as PolicyTaskStatus)}>{POLICY_TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</Select></div>
              <div className="sm:col-span-2"><Label>Action Taken</Label><Textarea className="min-h-28" value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="Describe the review, endorsement, issuance, or other action taken." /></div>
            </div>
            <Button onClick={savePolicyTaskDetails} disabled={saving}><Save className="h-4 w-4" /> Save Processing Details</Button>

            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-semibold text-slate-900">Comments from My Work</h3>
              <p className="mt-1 text-xs text-slate-500">This is the same comment thread used by the source task.</p>
              <div className="mt-3 space-y-3">
                {selectedTask.comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
                {flattenComments(selectedTask.comments).map(({ comment, depth }) => (
                  <div key={comment.id} className="rounded-lg border border-slate-200 p-3 text-sm" style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-800">{comment.author}</span><span className="text-xs text-slate-400">{formatDateTime(comment.timestamp)}</span></div>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{comment.deleted ? 'Comment deleted' : comment.message}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1"><Label>Add Comment</Label><Textarea className="min-h-20" value={taskComment} onChange={(event) => setTaskComment(event.target.value)} placeholder="Add to the shared My Work comment thread…" /></div>
                <Button size="icon" onClick={addSharedTaskComment} disabled={saving || !taskComment.trim()} aria-label="Add shared task comment"><MessageSquarePlus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmRemoveAttachment}
        onClose={() => { if (!removingAttachment) setConfirmRemoveAttachment(false); }}
        onConfirm={removeAttachment}
        title="Remove attachment?"
        description={`The DOCX attached to ${editingRecord?.documentNumber ?? 'this policy record'} will be permanently removed from Oracle. You can upload a new one afterward.`}
        confirmLabel={removingAttachment ? 'Removing…' : 'Remove Attachment'}
        destructive
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => { if (!saving) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title="Delete policy record?"
        description={`${deleteTarget?.documentNumber ?? 'This policy record'} will be removed from the active register. Its audit data is retained in Oracle.`}
        confirmLabel={saving ? 'Deleting…' : 'Delete Record'}
        destructive
      />
    </div>
  );
}

function flattenComments(comments: Comment[], depth = 0): { comment: Comment; depth: number }[] {
  return comments.flatMap((comment) => [
    { comment, depth },
    ...flattenComments(comment.replies ?? [], depth + 1),
  ]);
}
