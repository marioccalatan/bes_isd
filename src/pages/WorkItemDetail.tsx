import { useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, RotateCcw, XCircle, MessageSquarePlus, UserCog, Pencil, Ban, Paperclip, Send,
  Trash2, ChevronDown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Textarea, Select, Label } from '@/components/ui/input';
import { WorkflowStageTracker } from '@/components/shared/WorkflowStageTracker';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { useAuth } from '@/context/AuthContext';
import { canApprove } from '@/lib/permissions';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate, formatDateTime, processLabel, initials } from '@/lib/utils';
import { PROCESS_DEFS } from '@/lib/processDefs';
import { updateWorkTask } from '@/lib/api';
import { loadState, saveState } from '@/lib/storage';
import { MUNICIPALITIES, MUNICIPALITY_BARANGAYS } from '@/lib/locations';
import type { Comment, Priority, ProcessType, WorkStatus } from '@/lib/types';
import { EmptyState } from '@/components/ui/empty-state';
import NotFound from './NotFound';

const STAGE_TRACKER_TYPES: ProcessType[] = ['procurement-request', 'document-routing', 'project-proposal'];
const OFFICE_ASSIGNMENTS = ['General Services Office', 'Materials and Equipment Management Office', 'Community Relations Office', 'Human Resource Office'];
const OFFICE_SUBJECTS: Record<string, string[]> = {
  'Human Resource Office': ['Application Letter', 'Policy Related', 'Resignation Letter', 'Compliance', 'Memorandum'],
};
const CREATE_NEW_SUBJECT = '__CREATE_NEW_SUBJECT__';
const CUSTOM_SUBJECTS_KEY = 'my-work-custom-office-subjects';
const TASK_ATTACHMENT_ROOT = 'BES_TASKS';

function safeAttachmentName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_') || 'attachment';
}

function taskAttachmentPath(taskId: string, fileName: string, index: number) {
  return `${TASK_ATTACHMENT_ROOT}/${taskId}/${taskId}_${String(index).padStart(3, '0')}_${safeAttachmentName(fileName)}`;
}

export default function WorkItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workItems, approveStep, returnStep, rejectStep, reassignStep, addComment, editComment, deleteComment, cancelWorkItem, updateWorkItem, employees } = useData();
  const { toast } = useToast();
  const { effectiveRole } = useRolePreview();
  const { user, username, token } = useAuth();
  const item = workItems.find((w) => w.id === id);

  const [returnOpen, setReturnOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPurpose, setTaskPurpose] = useState('');
  const [taskControlNumber, setTaskControlNumber] = useState('');
  const [taskOfficeAssignments, setTaskOfficeAssignments] = useState<string[]>([]);
  const [officeDropdownOpen, setOfficeDropdownOpen] = useState(false);
  const [taskSubject, setTaskSubject] = useState('');
  const [customSubjectDraft, setCustomSubjectDraft] = useState('');
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [customOfficeSubjects, setCustomOfficeSubjects] = useState<Record<string, string[]>>(() => loadState(CUSTOM_SUBJECTS_KEY, () => ({})));
  const [taskPriority, setTaskPriority] = useState<Priority>('Normal');
  const [taskStatus, setTaskStatus] = useState<WorkStatus>('In Progress');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [taskMunicipality, setTaskMunicipality] = useState('');
  const [taskBarangay, setTaskBarangay] = useState('');
  const [taskAddress, setTaskAddress] = useState('');
  const [taskAttachments, setTaskAttachments] = useState<string[]>([]);
  const [taskAttachmentDragging, setTaskAttachmentDragging] = useState(false);
  const [reassignTo, setReassignTo] = useState('');

  if (!item) return <NotFound />;

  const pendingStep = item.approvalChain.find((s) => s.status === 'Pending');
  const showApprovalActions = item.status === 'Pending Approval' && !!pendingStep && canApprove(effectiveRole);
  const isRequestor = item.requestorId === CURRENT_EMPLOYEE.id;
  const canEdit = isRequestor && (item.status === 'Draft' || item.status === 'Returned');
  const canCancel = isRequestor && item.status === 'Draft';
  const def = PROCESS_DEFS[item.processType];
  const currentUsername = user?.username || username;
  const currentDisplayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || CURRENT_EMPLOYEE.name;
  const canModerateComments = ['Department Manager', 'Secretary', 'Administrator'].includes(effectiveRole);
  const canUpdateTask = item.processType === 'task-assignment'
    && (canModerateComments || item.requestorId === currentUsername || item.assigneeId === currentUsername);
  const taskOfficeAssignment = taskOfficeAssignments.join(', ');
  const officeSelectionLabel = taskOfficeAssignments.length === 0
    ? 'Select office assignment'
    : taskOfficeAssignments.length === 1
      ? taskOfficeAssignments[0]
      : `${taskOfficeAssignments.length} offices selected`;
  const configuredTaskSubjectOptions = taskOfficeAssignments.flatMap((office) => [
    ...(OFFICE_SUBJECTS[office] ?? []),
    ...(customOfficeSubjects[office] ?? []),
  ]);
  const taskSubjectOptions = Array.from(new Set([
    ...configuredTaskSubjectOptions,
    ...(taskOfficeAssignment && taskSubject && !configuredTaskSubjectOptions.includes(taskSubject) ? [taskSubject] : []),
  ]));
  const barangayOptions = taskMunicipality ? MUNICIPALITY_BARANGAYS[taskMunicipality] ?? [] : [];
  const visibleActivity = item.activity.filter((entry) => !['Added comment', 'Added reply'].includes(entry.action));

  function handleApprove() {
    if (!pendingStep) return;
    approveStep(item!.id, pendingStep.id, CURRENT_EMPLOYEE.name);
    toast({ kind: 'success', title: 'Request approved', description: `${item!.id} moved to the next step.` });
  }
  function handleReturn(remarks?: string) {
    if (!pendingStep || !remarks?.trim()) {
      toast({ kind: 'error', title: 'Remarks required', description: 'Please provide remarks when returning a request.' });
      return;
    }
    returnStep(item!.id, pendingStep.id, CURRENT_EMPLOYEE.name, remarks.trim());
    setReturnOpen(false);
    toast({ kind: 'warning', title: 'Request returned for revision' });
  }
  function handleReject(remarks?: string) {
    if (!pendingStep || !remarks?.trim()) {
      toast({ kind: 'error', title: 'Remarks required', description: 'Please provide remarks when rejecting a request.' });
      return;
    }
    rejectStep(item!.id, pendingStep.id, CURRENT_EMPLOYEE.name, remarks.trim());
    setRejectOpen(false);
    toast({ kind: 'error', title: 'Request rejected' });
  }
  function handleReassign() {
    if (!pendingStep || !reassignTo) return;
    reassignStep(item!.id, pendingStep.id, reassignTo);
    setReassignOpen(false);
    toast({ kind: 'info', title: 'Approval step reassigned', description: `Now assigned to ${reassignTo}.` });
  }
  async function handleComment(parentCommentId?: string) {
    const message = parentCommentId ? replyDraft.trim() : comment.trim();
    if (!message) return;
    const result = await addComment(item!.id, currentDisplayName, message, currentUsername, parentCommentId);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Comment not saved', description: result.error });
      return;
    }
    if (parentCommentId) {
      setReplyDraft('');
      setReplyingTo(null);
    }
    setComment('');
    toast({ kind: 'success', title: 'Comment added' });
  }
  async function handleDeleteComment(commentId: string) {
    const result = await deleteComment(item!.id, commentId);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Comment not deleted', description: result.error });
      return;
    }
    toast({ kind: 'info', title: 'Comment deleted' });
  }
  function displayCommentAuthor(c: Comment) {
    if (!c.authorId && item!.processType === 'task-assignment' && c.author === CURRENT_EMPLOYEE.name) return currentDisplayName;
    return c.author;
  }
  function canDeleteComment(c: Comment) {
    if (c.deleted) return false;
    if (canModerateComments) return true;
    if (c.authorId) return c.authorId === currentUsername;
    return item!.processType === 'task-assignment' && c.author === CURRENT_EMPLOYEE.name;
  }
  function canEditComment(c: Comment) {
    if (c.deleted) return false;
    return canDeleteComment(c);
  }
  async function handleEditComment(commentId: string) {
    const message = editCommentDraft.trim();
    if (!message) return;
    const result = await editComment(item!.id, commentId, message);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Comment not updated', description: result.error });
      return;
    }
    setEditingCommentId(null);
    setEditCommentDraft('');
    toast({ kind: 'success', title: 'Comment updated' });
  }
  function openTaskEdit() {
    const current = item!;
    setTaskTitle(current.title);
    setTaskPurpose(current.purpose);
    setTaskControlNumber(String(current.fields.controlNumber ?? ''));
    setTaskOfficeAssignments(String(current.fields.officeAssignment ?? '').split(',').map((office) => office.trim()).filter(Boolean));
    setOfficeDropdownOpen(false);
    setTaskSubject(String(current.fields.taskSubject ?? ''));
    setCustomSubjectDraft('');
    setCreatingSubject(false);
    setTaskPriority(current.priority);
    setTaskStatus(current.status);
    setTaskDueDate(current.dueDate ?? '');
    setTaskMunicipality(String(current.fields.municipality ?? ''));
    setTaskBarangay(String(current.fields.barangay ?? ''));
    setTaskAddress(String(current.fields.address ?? ''));
    setLocationOpen(Boolean(current.fields.municipality || current.fields.barangay || current.fields.address));
    setTaskAttachments([...current.attachments, ...(typeof current.fields.attachment === 'string' ? [current.fields.attachment] : [])]);
    setTaskAttachmentDragging(false);
    setTaskEditOpen(true);
  }
  function toggleTaskOffice(office: string, checked: boolean) {
    setTaskOfficeAssignments((current) => {
      const next = checked ? [...current, office] : current.filter((item) => item !== office);
      return OFFICE_ASSIGNMENTS.filter((item) => next.includes(item));
    });
    setCreatingSubject(false);
    setCustomSubjectDraft('');
  }
  function handleEditSubjectChange(value: string) {
    if (value === CREATE_NEW_SUBJECT) {
      setCreatingSubject(true);
      setTaskSubject('');
      return;
    }
    setCreatingSubject(false);
    setCustomSubjectDraft('');
    setTaskSubject(value);
  }
  function persistCustomSubject() {
    const nextSubject = customSubjectDraft.trim();
    if (!taskOfficeAssignment) {
      toast({ kind: 'error', title: 'Office required', description: 'Select an office before adding a subject.' });
      return '';
    }
    if (!nextSubject) {
      toast({ kind: 'error', title: 'Subject required', description: 'Enter the subject name to add.' });
      return '';
    }
    const existing = taskSubjectOptions.find((subject) => subject.toLowerCase() === nextSubject.toLowerCase());
    if (existing) {
      setTaskSubject(existing);
      setCreatingSubject(false);
      setCustomSubjectDraft('');
      return existing;
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
    return nextSubject;
  }
  async function saveTaskEdit(statusOverride?: WorkStatus) {
    if (!token) {
      toast({ kind: 'error', title: 'Session required', description: 'Please sign in again to update this task.' });
      return;
    }
    const current = item!;
    const editingFromModal = taskEditOpen;
    const subjectForSave = editingFromModal && creatingSubject ? persistCustomSubject() : (editingFromModal ? taskSubject : String(current.fields.taskSubject ?? ''));
    if (editingFromModal && creatingSubject && !subjectForSave) return;
    setTaskSaving(true);
    try {
      const result = await updateWorkTask(token, current.id, {
        title: editingFromModal ? taskTitle : current.title,
        description: editingFromModal ? taskPurpose : current.purpose,
        controlNumber: editingFromModal ? taskControlNumber : String(current.fields.controlNumber ?? ''),
        officeAssignment: editingFromModal ? taskOfficeAssignment : String(current.fields.officeAssignment ?? ''),
        taskSubject: subjectForSave,
        attachments: editingFromModal ? taskAttachments : current.attachments,
        municipality: editingFromModal ? (taskMunicipality || undefined) : (String(current.fields.municipality ?? '') || undefined),
        barangay: editingFromModal ? (taskBarangay || undefined) : (String(current.fields.barangay ?? '') || undefined),
        address: editingFromModal ? (taskAddress.trim() || undefined) : (String(current.fields.address ?? '') || undefined),
        priority: editingFromModal ? taskPriority : current.priority,
        dueDate: editingFromModal ? taskDueDate : current.dueDate,
        status: statusOverride ?? (editingFromModal ? taskStatus : current.status),
      });
      updateWorkItem(current.id, {
        ...result.task,
        comments: current.comments,
        activity: [...current.activity, { id: `A-${Date.now()}`, timestamp: new Date().toISOString(), actor: currentDisplayName, action: statusOverride ? `Marked ${statusOverride}` : 'Updated task details' }],
      });
      setTaskEditOpen(false);
      toast({ kind: 'success', title: statusOverride ? `Task ${statusOverride.toLowerCase()}` : 'Task updated' });
    } catch (error) {
      toast({ kind: 'error', title: 'Task not updated', description: error instanceof Error ? error.message : 'Unable to update task.' });
    } finally {
      setTaskSaving(false);
    }
  }
  function addTaskAttachmentFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    setTaskAttachments((current) => {
      const next = [...current];
      incoming.forEach((file) => {
        const path = taskAttachmentPath(item!.id, file.name, next.length + 1);
        if (!next.includes(path)) next.push(path);
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
  function handleCancel() {
    cancelWorkItem(item!.id, CURRENT_EMPLOYEE.name);
    setCancelOpen(false);
    toast({ kind: 'info', title: 'Draft cancelled' });
  }

  const managers = employees.filter((e) => e.isManager);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={item.title}
        description={`${item.id} · ${processLabel(item.processType)}`}
        crumbs={[{ label: 'My Work', to: '/my-work' }, { label: item.id }]}
        actions={
          <>
            <StatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
          </>
        }
      />

      {STAGE_TRACKER_TYPES.includes(item.processType) && item.approvalChain.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Workflow Stage Tracker</CardTitle></CardHeader>
          <CardContent><WorkflowStageTracker steps={item.approvalChain} /></CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Request Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                <Detail label="Reference Number" value={item.id} />
                <Detail label="Process" value={processLabel(item.processType)} />
                <Detail label="Requestor" value={item.requestorName} />
                <Detail label="Department" value={item.departmentId} />
                <Detail label="Date Submitted" value={formatDate(item.dateSubmitted)} />
                <Detail label="Current Status" value={<StatusBadge status={item.status} />} />
              </dl>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Purpose / Description</p>
                <p className="text-sm text-slate-700">{item.purpose}</p>
              </div>
              {Object.keys(item.fields).length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted Information</p>
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                    {def?.fields.map((f) => {
                      const v = item.fields[f.name];
                      if (v === undefined || v === '' || f.name === 'attachment') return null;
                      return <Detail key={f.name} label={f.label} value={typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)} />;
                    })}
                  </dl>
                </div>
              )}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Attachments</p>
                {item.attachments.length === 0 && !item.fields.attachment ? (
                  <p className="text-sm text-slate-400">No attachments.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {[...item.attachments, ...(typeof item.fields.attachment === 'string' ? [item.fields.attachment] : [])].map((a) => (
                      <li key={a}>
                        <button
                          onClick={() => toast({ kind: 'info', title: 'Simulated download', description: `${a} would download here in production.` })}
                          className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> {a}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {item.approvalChain.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {item.approvalChain.map((step) => (
                    <li key={step.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                        {initials(step.approverName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{step.stepName} — {step.approverName}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge className={step.status === 'Approved' ? 'border-green-200 bg-green-50 text-green-700' : step.status === 'Rejected' ? 'border-red-200 bg-red-50 text-red-700' : step.status === 'Returned' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-500'}>
                            {step.status}
                          </Badge>
                          {step.actedAt && <span className="text-xs text-slate-400">{formatDateTime(step.actedAt)}</span>}
                        </div>
                        {step.remarks && <p className="mt-1 text-sm text-slate-600">"{step.remarks}"</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Comments</CardTitle></CardHeader>
            <CardContent>
              {item.comments.length === 0 ? (
                <EmptyState title="No comments yet" description="Be the first to add context to this request." />
              ) : (
                <ul className="mb-4 space-y-3">
                  {item.comments.map((c) => (
                    <CommentThread
                      key={c.id}
                      comment={c}
                      depth={0}
                      displayAuthor={displayCommentAuthor}
                      canDelete={canDeleteComment}
                      canEdit={canEditComment}
                      onDelete={handleDeleteComment}
                      onEdit={handleEditComment}
                      replyingTo={replyingTo}
                      setReplyingTo={setReplyingTo}
                      replyDraft={replyDraft}
                      setReplyDraft={setReplyDraft}
                      editingCommentId={editingCommentId}
                      setEditingCommentId={setEditingCommentId}
                      editCommentDraft={editCommentDraft}
                      setEditCommentDraft={setEditCommentDraft}
                      onReply={handleComment}
                    />
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="min-h-[60px] flex-1" aria-label="Add comment" />
                <Button onClick={() => handleComment()} size="sm"><MessageSquarePlus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {visibleActivity.slice().reverse().map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                    <p className="text-sm font-medium text-slate-800">{a.action} <span className="font-normal text-slate-400">— {a.actor}</span></p>
                    {a.detail && <p className="text-sm text-slate-500">{a.detail}</p>}
                    <p className="text-xs text-slate-400">{formatDateTime(a.timestamp)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Available Actions</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {canUpdateTask && (
                <>
                  <Button onClick={openTaskEdit}><Pencil className="h-4 w-4" /> Edit Task Details</Button>
                  {item.status !== 'Completed' ? (
                    <Button variant="outline" onClick={() => saveTaskEdit('Completed')} disabled={taskSaving}><CheckCircle2 className="h-4 w-4" /> Mark Completed</Button>
                  ) : (
                    <Button variant="outline" onClick={() => saveTaskEdit('In Progress')} disabled={taskSaving}><RotateCcw className="h-4 w-4" /> Reopen Task</Button>
                  )}
                </>
              )}
              {showApprovalActions && (
                <>
                  <Button onClick={handleApprove}><CheckCircle2 className="h-4 w-4" /> Approve</Button>
                  <Button variant="outline" onClick={() => setReturnOpen(true)}><RotateCcw className="h-4 w-4" /> Return for Revision</Button>
                  <Button variant="destructive" onClick={() => setRejectOpen(true)}><XCircle className="h-4 w-4" /> Reject</Button>
                  <Button variant="outline" onClick={() => setReassignOpen(true)}><UserCog className="h-4 w-4" /> Reassign</Button>
                </>
              )}
              {canEdit && (
                <Button variant="outline" onClick={() => navigate(`/requests/new/${item.processType}?edit=${item.id}`)}>
                  <Pencil className="h-4 w-4" /> {item.status === 'Draft' ? 'Continue Editing' : 'Edit and Resubmit'}
                </Button>
              )}
              {canCancel && (
                <Button variant="outline" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" /> Cancel Draft</Button>
              )}
              {!showApprovalActions && !canEdit && !canCancel && !canUpdateTask && (
                <p className="text-sm text-slate-400">No actions available for this item at its current stage or your current role.</p>
              )}
            </CardContent>
          </Card>

          {pendingStep && (
            <Card>
              <CardHeader><CardTitle>Pending With</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-slate-800">{pendingStep.approverName}</p>
                <p className="text-xs text-slate-500">{pendingStep.stepName}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={returnOpen} onClose={() => setReturnOpen(false)} onConfirm={handleReturn}
        title="Return for Revision" description="This request will be sent back to the requestor for revision." confirmLabel="Return" requireRemarks
      />
      <ConfirmDialog
        open={rejectOpen} onClose={() => setRejectOpen(false)} onConfirm={handleReject}
        title="Reject Request" description="This request will be marked as rejected. This action cannot be undone." confirmLabel="Reject" destructive requireRemarks
      />
      <ConfirmDialog
        open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={handleCancel}
        title="Cancel Draft" description="This draft request will be cancelled and removed from your active drafts." confirmLabel="Cancel Draft" destructive
      />
      <Dialog
        open={taskEditOpen} onClose={() => setTaskEditOpen(false)} title="Edit Task Details" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setTaskEditOpen(false)} disabled={taskSaving}>Cancel</Button>
            <Button onClick={() => saveTaskEdit()} disabled={taskSaving}>{taskSaving ? 'Saving…' : 'Save Changes'}</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Task ID — view only</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-800">{item.id}</p>
          </div>
          <div>
            <Label htmlFor="edit-task-title" required>Task title</Label>
            <Input id="edit-task-title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-task-purpose">Purpose / Description</Label>
            <Textarea id="edit-task-purpose" value={taskPurpose} onChange={(e) => setTaskPurpose(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="edit-control-number">Control Number</Label>
              <Input id="edit-control-number" value={taskControlNumber} onChange={(e) => setTaskControlNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="edit-priority">Priority</Label>
              <Select id="edit-priority" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Priority)}>
                <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
              </Select>
            </div>
            <div>
              <Label>Office Assignment</Label>
              <div className="relative mt-1">
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
                      <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-700" onClick={() => { setTaskOfficeAssignments([]); setTaskSubject(''); setCreatingSubject(false); setCustomSubjectDraft(''); }}>
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
              <Label htmlFor="edit-subject">Subject</Label>
              <Select id="edit-subject" value={creatingSubject ? CREATE_NEW_SUBJECT : taskSubject} onChange={(e) => handleEditSubjectChange(e.target.value)} disabled={taskOfficeAssignments.length === 0}>
                <option value="">{taskOfficeAssignments.length ? 'Select subject' : 'Select office first'}</option>
                {taskSubjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                {taskOfficeAssignments.length > 0 && <option value={CREATE_NEW_SUBJECT}>+ Create new subject…</option>}
              </Select>
              {taskOfficeAssignments.length > 1 && <p className="mt-1 text-xs text-slate-500">Subjects are merged from all selected offices.</p>}
              {creatingSubject && (
                <div className="mt-2 flex gap-2">
                  <Input value={customSubjectDraft} onChange={(e) => setCustomSubjectDraft(e.target.value)} placeholder="Enter new subject" />
                  <Button type="button" variant="outline" onClick={persistCustomSubject}>Add</Button>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select id="edit-status" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as WorkStatus)}>
                <option>In Progress</option><option>Completed</option><option>Returned</option><option>Cancelled</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-due-date">Due Date</Label>
              <Input id="edit-due-date" type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <button type="button" onClick={() => setLocationOpen((open) => !open)} className="text-sm font-semibold text-brand-700 hover:underline">
              {locationOpen ? 'Hide optional location details' : 'Add optional location details'}
            </button>
            {locationOpen && (
              <div className="mt-2 grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-task-municipality">Municipality</Label>
                  <Select id="edit-task-municipality" value={taskMunicipality} onChange={(e) => { setTaskMunicipality(e.target.value); setTaskBarangay(''); }}>
                    <option value="">Select municipality</option>
                    {MUNICIPALITIES.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-task-barangay">Barangay</Label>
                  <Select id="edit-task-barangay" value={taskBarangay} onChange={(e) => setTaskBarangay(e.target.value)} disabled={!taskMunicipality}>
                    <option value="">{taskMunicipality ? 'Select barangay' : 'Select municipality first'}</option>
                    {barangayOptions.map((barangay) => <option key={barangay} value={barangay}>{barangay}</option>)}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="edit-task-address">Address</Label>
                  <Input id="edit-task-address" value={taskAddress} onChange={(e) => setTaskAddress(e.target.value)} placeholder="House no., street, purok, landmark, or other address details" />
                </div>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="edit-task-files">Attachments</Label>
            <label
              htmlFor="edit-task-files"
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
              <Input id="edit-task-files" type="file" multiple onChange={handleTaskAttachmentInput} className="sr-only" />
            </label>
            <div className="mt-2 rounded-md border border-gold-200 bg-gold-50 p-2 text-xs text-gold-800">
              Folder convention: <span className="font-mono">{TASK_ATTACHMENT_ROOT}/{item.id}/</span>. File names are saved as <span className="font-mono">{item.id}_001_filename.ext</span>.
            </div>
            {taskAttachments.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {taskAttachments.map((attachment) => (
                  <li key={attachment} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                    <span className="min-w-0 truncate font-mono text-slate-600">{attachment}</span>
                    <button
                      type="button"
                      onClick={() => setTaskAttachments((current) => current.filter((item) => item !== attachment))}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Remove ${attachment}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Dialog>
      <Dialog
        open={reassignOpen} onClose={() => setReassignOpen(false)} title="Reassign Approval Step" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button onClick={handleReassign} disabled={!reassignTo}><Send className="h-4 w-4" /> Reassign</Button>
          </>
        }
      >
        <Label htmlFor="reassign-to">New Approver</Label>
        <Select id="reassign-to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
          <option value="">Select an approver…</option>
          {managers.map((m) => <option key={m.id} value={m.name}>{m.name} — {m.position}</option>)}
        </Select>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-700">{value}</dd>
    </div>
  );
}

function CommentThread({
  comment,
  depth,
  displayAuthor,
  canDelete,
  canEdit,
  onDelete,
  onEdit,
  replyingTo,
  setReplyingTo,
  replyDraft,
  setReplyDraft,
  editingCommentId,
  setEditingCommentId,
  editCommentDraft,
  setEditCommentDraft,
  onReply,
}: {
  comment: Comment;
  depth: number;
  displayAuthor: (comment: Comment) => string;
  canDelete: (comment: Comment) => boolean;
  canEdit: (comment: Comment) => boolean;
  onDelete: (commentId: string) => void;
  onEdit: (commentId: string) => void;
  replyingTo: string | null;
  setReplyingTo: (commentId: string | null) => void;
  replyDraft: string;
  setReplyDraft: (value: string) => void;
  editingCommentId: string | null;
  setEditingCommentId: (commentId: string | null) => void;
  editCommentDraft: string;
  setEditCommentDraft: (value: string) => void;
  onReply: (parentCommentId: string) => void;
}) {
  const author = displayAuthor(comment);
  const isReplying = replyingTo === comment.id;
  const isEditing = editingCommentId === comment.id;
  return (
    <li className="space-y-2" style={{ marginLeft: depth ? Math.min(depth, 6) * 18 : 0 }}>
      <div className="flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(author)}</span>
        <div className="min-w-0 flex-1 rounded-lg bg-slate-50 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700">{author} <span className="ml-1 font-normal text-slate-400">{formatDateTime(comment.timestamp)}</span></p>
            <div className="flex items-center gap-2 text-xs">
              {!comment.deleted && (
                <button
                  type="button"
                  className="font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setReplyingTo(isReplying ? null : comment.id);
                    setReplyDraft('');
                  }}
                >
                  Reply
                </button>
              )}
              {canEdit(comment) && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-brand-600 hover:underline"
                  onClick={() => {
                    setEditingCommentId(isEditing ? null : comment.id);
                    setEditCommentDraft(comment.message);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
              {canDelete(comment) && (
                <button type="button" className="inline-flex items-center gap-1 font-medium text-red-500 hover:underline" onClick={() => onDelete(comment.id)}>
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              )}
            </div>
          </div>
          {isEditing ? (
            <div className="mt-3 flex items-start gap-2">
              <Textarea value={editCommentDraft} onChange={(e) => setEditCommentDraft(e.target.value)} className="min-h-[50px] flex-1" />
              <Button onClick={() => onEdit(comment.id)} size="sm"><Pencil className="h-4 w-4" /></Button>
              <Button variant="outline" onClick={() => { setEditingCommentId(null); setEditCommentDraft(''); }} size="sm">Cancel</Button>
            </div>
          ) : (
            <p className={`mt-0.5 whitespace-pre-wrap text-sm ${comment.deleted ? 'italic text-slate-400' : 'text-slate-700'}`}>{comment.message}</p>
          )}
          {isReplying && (
            <div className="mt-3 flex items-start gap-2">
              <Textarea value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder={`Reply to ${author}…`} className="min-h-[50px] flex-1" />
              <Button onClick={() => onReply(comment.id)} size="sm"><MessageSquarePlus className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </div>
      {(comment.replies ?? []).length > 0 && (
        <ul className="space-y-2">
          {(comment.replies ?? []).map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              displayAuthor={displayAuthor}
              canDelete={canDelete}
              canEdit={canEdit}
              onDelete={onDelete}
              onEdit={onEdit}
              replyingTo={replyingTo}
              setReplyingTo={setReplyingTo}
              replyDraft={replyDraft}
              setReplyDraft={setReplyDraft}
              editingCommentId={editingCommentId}
              setEditingCommentId={setEditingCommentId}
              editCommentDraft={editCommentDraft}
              setEditCommentDraft={setEditCommentDraft}
              onReply={onReply}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
