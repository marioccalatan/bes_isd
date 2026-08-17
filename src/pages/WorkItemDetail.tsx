import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, RotateCcw, XCircle, MessageSquarePlus, UserCog, Pencil, Ban, Paperclip, Send,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge, Badge } from '@/components/ui/badge';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Textarea, Select, Label } from '@/components/ui/input';
import { WorkflowStageTracker } from '@/components/shared/WorkflowStageTracker';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canApprove } from '@/lib/permissions';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate, formatDateTime, processLabel, initials } from '@/lib/utils';
import { PROCESS_DEFS } from '@/lib/processDefs';
import type { ProcessType } from '@/lib/types';
import { EmptyState } from '@/components/ui/empty-state';
import NotFound from './NotFound';

const STAGE_TRACKER_TYPES: ProcessType[] = ['procurement-request', 'document-routing', 'project-proposal'];

export default function WorkItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workItems, approveStep, returnStep, rejectStep, reassignStep, addComment, cancelWorkItem, employees } = useData();
  const { toast } = useToast();
  const { effectiveRole } = useRolePreview();
  const item = workItems.find((w) => w.id === id);

  const [returnOpen, setReturnOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [reassignTo, setReassignTo] = useState('');

  if (!item) return <NotFound />;

  const pendingStep = item.approvalChain.find((s) => s.status === 'Pending');
  const showApprovalActions = item.status === 'Pending Approval' && !!pendingStep && canApprove(effectiveRole);
  const isRequestor = item.requestorId === CURRENT_EMPLOYEE.id;
  const canEdit = isRequestor && (item.status === 'Draft' || item.status === 'Returned');
  const canCancel = isRequestor && item.status === 'Draft';
  const def = PROCESS_DEFS[item.processType];

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
  function handleComment() {
    if (!comment.trim()) return;
    addComment(item!.id, CURRENT_EMPLOYEE.name, comment.trim());
    setComment('');
    toast({ kind: 'success', title: 'Comment added' });
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
                    <li key={c.id} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(c.author)}</span>
                      <div className="min-w-0 flex-1 rounded-lg bg-slate-50 p-2.5">
                        <p className="text-xs font-semibold text-slate-700">{c.author} <span className="ml-1 font-normal text-slate-400">{formatDateTime(c.timestamp)}</span></p>
                        <p className="mt-0.5 text-sm text-slate-700">{c.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-start gap-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="min-h-[60px] flex-1" aria-label="Add comment" />
                <Button onClick={handleComment} size="sm"><MessageSquarePlus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {item.activity.slice().reverse().map((a) => (
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
              {!showApprovalActions && !canEdit && !canCancel && (
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
