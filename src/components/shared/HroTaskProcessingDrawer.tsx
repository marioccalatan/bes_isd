import { useEffect, useState } from 'react';
import { Archive, MessageSquarePlus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { updateHroToolTaskProcessing, type PolicyTaskProcessing, type PolicyTaskStatus } from '@/lib/api';
import type { Comment, WorkItem } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

const PROCESSING_STATUSES: PolicyTaskStatus[] = ['Received', 'Under Review', 'For Approval', 'Approved', 'Issued', 'Completed', 'Returned'];

interface HroTaskProcessingDrawerProps {
  open: boolean;
  task: WorkItem | null;
  moduleId: string;
  moduleName: string;
  processing?: PolicyTaskProcessing;
  onClose: () => void;
  onSaved: (record: PolicyTaskProcessing) => void;
  onArchive?: () => void;
}

export function HroTaskProcessingDrawer({ open, task, moduleId, moduleName, processing, onClose, onSaved, onArchive }: HroTaskProcessingDrawerProps) {
  const { token, user } = useAuth();
  const { addComment } = useData();
  const { toast } = useToast();
  const [status, setStatus] = useState<PolicyTaskStatus>('Received');
  const [actionTaken, setActionTaken] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setStatus(processing?.status ?? 'Received');
    setActionTaken(processing?.actionTaken ?? '');
    setComment('');
  }, [processing, task]);

  async function saveDetails() {
    if (!task) return;
    setSaving(true);
    try {
      const result = await updateHroToolTaskProcessing(token, moduleId, task.id, { status, actionTaken });
      onSaved(result.record);
      toast({ kind: 'success', title: `${moduleName} task updated`, description: 'The tool-specific processing details were saved without changing the source My Work task.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update task', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function submitComment() {
    if (!task || !comment.trim()) return;
    setSaving(true);
    const result = await addComment(task.id, user?.name ?? user?.username ?? 'User', comment.trim(), user?.username);
    setSaving(false);
    if (!result.ok) {
      toast({ kind: 'error', title: 'Unable to add comment', description: result.error });
      return;
    }
    setComment('');
    toast({ kind: 'success', title: 'Comment added', description: 'The comment is also visible in My Work.' });
  }

  return (
    <Drawer open={open} onClose={onClose} title={task?.title ?? `${moduleName} Task`} widthClass="max-w-2xl">
      {task && (
        <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm">
            <p className="font-medium text-slate-800">Source My Work task</p>
            <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-500">Task ID</dt><dd className="font-mono text-slate-700">{task.id}</dd></div>
              <div><dt className="text-slate-500">Control No.</dt><dd className="text-slate-700">{String(task.fields.controlNumber ?? '—')}</dd></div>
              <div><dt className="text-slate-500">Created By</dt><dd className="text-slate-700">{task.requestorName}</dd></div>
              <div><dt className="text-slate-500">Assigned To</dt><dd className="text-slate-700">{task.assigneeName ?? 'Unassigned'}</dd></div>
            </dl>
            <p className="mt-3 whitespace-pre-wrap text-slate-700">{task.purpose || 'No task description.'}</p>
            <p className="mt-2 text-xs text-slate-400">Source task fields are view-only in {moduleName}.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label required>{moduleName} Status</Label><Select value={status} onChange={(event) => setStatus(event.target.value as PolicyTaskStatus)}>{PROCESSING_STATUSES.map((item) => <option key={item}>{item}</option>)}</Select></div>
            <div className="sm:col-span-2"><Label>Action Taken</Label><Textarea className="min-h-28" value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} placeholder="Describe the review, endorsement, action, or outcome." /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveDetails} disabled={saving}><Save className="h-4 w-4" /> Save Processing Details</Button>
            {onArchive && <Button variant="outline" onClick={onArchive} disabled={saving}><Archive className="h-4 w-4" /> Archive</Button>}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">Comments from My Work</h3>
            <p className="mt-1 text-xs text-slate-500">This is the same comment thread used by the source task.</p>
            <div className="mt-3 space-y-3">
              {task.comments.length === 0 && <p className="text-sm text-slate-500">No comments yet.</p>}
              {flattenComments(task.comments).map(({ comment: item, depth }) => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-sm" style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-800">{item.author}</span><span className="text-xs text-slate-400">{formatDateTime(item.timestamp)}</span></div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{item.deleted ? 'Comment deleted' : item.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1"><Label>Add Comment</Label><Textarea className="min-h-20" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add to the shared My Work comment thread…" /></div>
              <Button size="icon" onClick={submitComment} disabled={saving || !comment.trim()} aria-label="Add shared task comment"><MessageSquarePlus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function flattenComments(comments: Comment[], depth = 0): { comment: Comment; depth: number }[] {
  return comments.flatMap((comment) => [{ comment, depth }, ...flattenComments(comment.replies ?? [], depth + 1)]);
}
