import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, MapPin, Pencil, Plus, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  createBfmFacility, createBfmPersonnel, createBfmTodo, deleteBfmFacility, deleteBfmTodo, fetchBfmOperations, updateBfmFacility, updateBfmTodo, updateBfmTodoStatus,
  type BfmFacility, type BfmOperationsData, type BfmTodo, type BfmTodoStatus,
} from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

const FACILITY_TYPES = ['Facility Group', 'Building', 'Substation', 'Floor', 'Room', 'Area', 'Office', 'Warehouse', 'Other'];
const CATEGORIES = ['General', 'Electrical', 'Plumbing', 'Inspection', 'Housekeeping', 'Civil Works', 'Mechanical', 'Safety', 'Security', 'Landscaping'];
const FREQUENCIES = ['As Needed', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Custom'];
const WEEKDAYS = [{ day: 1, label: 'Monday' }, { day: 2, label: 'Tuesday' }, { day: 3, label: 'Wednesday' }, { day: 4, label: 'Thursday' }, { day: 5, label: 'Friday' }, { day: 6, label: 'Saturday' }, { day: 7, label: 'Sunday' }];
const STATUSES: BfmTodoStatus[] = ['Pending', 'In Progress', 'Completed', 'Deferred'];

const emptyFacility = { name: '', type: 'Building', description: '', location: '' };
const emptyPersonnel = { name: '', employeeNo: '', position: '', contact: '' };
const emptyTodo = { title: '', description: '', category: 'General', frequency: 'As Needed', customDays: [] as number[], priority: 'Normal', dueDate: '', workerIds: [] as string[] };

export function BuildingFacilitiesOperations() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<BfmOperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [facilityDialog, setFacilityDialog] = useState<{ parent?: BfmFacility; editing?: BfmFacility } | null>(null);
  const [facilityForm, setFacilityForm] = useState(emptyFacility);
  const [personnelOpen, setPersonnelOpen] = useState(false);
  const [personnelForm, setPersonnelForm] = useState(emptyPersonnel);
  const [todoFacility, setTodoFacility] = useState<BfmFacility | null>(null);
  const [editingTodo, setEditingTodo] = useState<BfmTodo | null>(null);
  const [todoForm, setTodoForm] = useState(emptyTodo);
  const [statusTodo, setStatusTodo] = useState<BfmTodo | null>(null);
  const [statusForm, setStatusForm] = useState<{ status: BfmTodoStatus; workerId: string; note: string }>({ status: 'Completed', workerId: '', note: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBfmOperations(token)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setExpanded(new Set(next.facilities.filter((facility) => !facility.parentId || facility.type === 'Building').map((facility) => facility.id)));
      })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load facilities', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, toast]);

  const childrenByParent = useMemo(() => {
    const result = new Map<string, BfmFacility[]>();
    for (const facility of data?.facilities ?? []) {
      const key = facility.parentId ?? 'ROOT';
      const values = result.get(key) ?? [];
      values.push(facility);
      result.set(key, values);
    }
    for (const values of result.values()) values.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return result;
  }, [data?.facilities]);

  const todosByFacility = useMemo(() => {
    const result = new Map<string, BfmTodo[]>();
    for (const todo of data?.todos ?? []) {
      const values = result.get(todo.facilityId) ?? [];
      values.push(todo);
      result.set(todo.facilityId, values);
    }
    return result;
  }, [data?.todos]);

  const todoTemplates = useMemo(() => {
    const grouped = new Map<string, BfmTodo[]>();
    for (const todo of data?.todos ?? []) {
      const key = todo.title.trim().toLowerCase();
      const values = grouped.get(key) ?? [];
      values.push(todo);
      grouped.set(key, values);
    }
    return [...grouped.values()].map((values) => {
      const variants = new Map<string, { todo: BfmTodo; count: number }>();
      for (const todo of values) {
        const key = [todo.category, todo.frequency, todo.priority, todo.description].join('|');
        const current = variants.get(key);
        variants.set(key, { todo, count: (current?.count ?? 0) + 1 });
      }
      return [...variants.values()].sort((left, right) => right.count - left.count)[0].todo;
    }).sort((left, right) => left.title.localeCompare(right.title));
  }, [data?.todos]);

  function replaceData(next: BfmOperationsData) {
    setData((current) => ({ ...next, canManage: current?.canManage }));
  }

  function openAddFacility(parent?: BfmFacility) {
    setFacilityForm({ ...emptyFacility, type: parent?.type === 'Facility Group' && parent.name === 'Substations' ? 'Substation' : parent ? 'Area' : 'Facility Group' });
    setFacilityDialog({ parent });
  }

  function openEditFacility(facility: BfmFacility) {
    setFacilityForm({ name: facility.name, type: facility.type, description: facility.description, location: facility.location });
    setFacilityDialog({ editing: facility });
  }

  async function saveFacility() {
    if (!facilityForm.name.trim() || !facilityDialog) return;
    setSaving(true);
    try {
      const next = facilityDialog.editing
        ? await updateBfmFacility(token, facilityDialog.editing.id, facilityForm)
        : await createBfmFacility(token, { ...facilityForm, parentId: facilityDialog.parent?.id });
      replaceData(next);
      if (facilityDialog.parent) setExpanded((current) => new Set(current).add(facilityDialog.parent!.id));
      setFacilityDialog(null);
      toast({ kind: 'success', title: facilityDialog.editing ? 'Facility updated' : 'Facility added', description: `${facilityForm.name} was saved in Oracle.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save facility', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function removeFacility() {
    const facility = facilityDialog?.editing;
    if (!facility || !window.confirm(`Delete ${facility.name} and every child facility, to-do, project, and maintenance record under it? This cannot be undone.`)) return;
    setSaving(true);
    try { replaceData(await deleteBfmFacility(token, facility.id)); setFacilityDialog(null); toast({ kind: 'success', title: 'Facility deleted', description: `${facility.name} and its child records were deleted from Oracle.` }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete facility', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }

  async function savePersonnel() {
    if (!personnelForm.name.trim()) return;
    setSaving(true);
    try {
      replaceData(await createBfmPersonnel(token, personnelForm));
      setPersonnelOpen(false);
      setPersonnelForm(emptyPersonnel);
      toast({ kind: 'success', title: 'Personnel added', description: `${personnelForm.name} can now be assigned to facility tasks.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add personnel', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function saveTodo() {
    if (!todoFacility || !todoForm.title.trim()) return;
    setSaving(true);
    try {
      replaceData(editingTodo
        ? await updateBfmTodo(token, editingTodo.id, todoForm)
        : await createBfmTodo(token, { ...todoForm, facilityId: todoFacility.id }));
      setTodoFacility(null);
      setEditingTodo(null);
      setTodoForm(emptyTodo);
      toast({ kind: 'success', title: editingTodo ? 'To-do updated' : 'To-do added', description: `${todoForm.title} was saved in Oracle.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add to-do', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function removeTodo() {
    if (!editingTodo || !window.confirm(`Delete ${editingTodo.title} and all of its maintenance history and findings? This cannot be undone.`)) return;
    setSaving(true);
    try { replaceData(await deleteBfmTodo(token, editingTodo.id)); setTodoFacility(null); setEditingTodo(null); toast({ kind: 'success', title: 'To-do deleted', description: 'The to-do and its related records were deleted from Oracle.' }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete to-do', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }

  function openEditTodo(todo: BfmTodo) {
    const facility = data?.facilities.find((item) => item.id === todo.facilityId);
    if (!facility) return;
    setEditingTodo(todo);
    setTodoFacility(facility);
    setTodoForm({ title: todo.title, description: todo.description, category: todo.category, frequency: todo.frequency, customDays: [...todo.customDays], priority: todo.priority, dueDate: todo.dueDate, workerIds: [...todo.workerIds] });
  }

  function updateTodoTitle(title: string) {
    const template = todoTemplates.find((todo) => todo.title.trim().toLowerCase() === title.trim().toLowerCase());
    setTodoForm((current) => template ? {
      ...current,
      title,
      category: template.category,
      frequency: template.frequency,
      customDays: [...template.customDays],
      priority: template.priority,
      description: template.description,
    } : { ...current, title });
  }

  function openStatus(todo: BfmTodo) {
    setStatusTodo(todo);
    setStatusForm({ status: todo.status === 'Completed' ? 'Pending' : 'Completed', workerId: todo.workerIds[0] ?? '', note: '' });
  }

  async function saveStatus() {
    if (!statusTodo) return;
    setSaving(true);
    try {
      replaceData(await updateBfmTodoStatus(token, statusTodo.id, { status: statusForm.status, workerId: statusForm.workerId || undefined, note: statusForm.note || undefined }));
      setStatusTodo(null);
      toast({ kind: 'success', title: 'Task updated', description: `Status changed to ${statusForm.status}. The update was logged under your account.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update task', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  function renderFacility(facility: BfmFacility, depth = 0): ReactNode {
    const children = childrenByParent.get(facility.id) ?? [];
    const todos = todosByFacility.get(facility.id) ?? [];
    const isExpanded = expanded.has(facility.id);
    return (
      <div key={facility.id} className={depth ? 'ml-4 border-l border-slate-200 pl-3' : ''}>
        <div className="mb-2 rounded-lg border border-slate-200 bg-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="flex min-w-0 items-start gap-2 text-left" onClick={() => setExpanded((current) => { const next = new Set(current); next.has(facility.id) ? next.delete(facility.id) : next.add(facility.id); return next; })}>
              {(children.length || todos.length) ? (isExpanded ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />) : <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
              <span className="min-w-0"><span className="font-semibold text-slate-900">{facility.name}</span><span className="ml-2 text-xs text-slate-500">{facility.type}</span>{facility.location && <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{facility.location}</span>}{facility.description && <span className="mt-1 block text-xs text-slate-500">{facility.description}</span>}</span>
            </button>
            {data?.canManage && <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => openEditFacility(facility)}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button size="sm" variant="outline" onClick={() => openAddFacility(facility)}><Plus className="h-3.5 w-3.5" /> Sub-facility</Button><Button size="sm" onClick={() => { setEditingTodo(null); setTodoFacility(facility); setTodoForm(emptyTodo); }}><ClipboardCheck className="h-3.5 w-3.5" /> To-do</Button></div>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Last updated by {facility.updatedBy} · {formatDateTime(facility.updatedAt)}</p>
        </div>
        {isExpanded && <div className="space-y-2">
          {todos.map((todo) => {
            const workers = (data?.personnel ?? []).filter((worker) => todo.workerIds.includes(worker.id));
            return <div key={todo.id} className="ml-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3 sm:flex-row sm:items-start sm:justify-between">
              <button type="button" onClick={() => openStatus(todo)} className="flex min-w-0 items-start gap-2 text-left">
                <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${todo.status === 'Completed' ? 'text-brand-600' : 'text-slate-400'}`} />
                <span><span className={`font-medium ${todo.status === 'Completed' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{todo.title}</span><span className="mt-1 flex flex-wrap gap-1.5"><Badge>{todo.category}</Badge><Badge>{todo.frequency}</Badge><Badge>{todo.status}</Badge><Badge>{todo.priority}</Badge></span>{todo.description && <span className="mt-1 block text-xs text-slate-500">{todo.description}</span>}{workers.length > 0 && <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Users className="h-3 w-3" />{workers.map((worker) => worker.name).join(', ')}</span>}</span>
              </button>
              <span className="flex shrink-0 items-center gap-2"><span className="text-[11px] text-slate-400">Updated by {todo.updatedBy}{todo.dueDate ? ` · Due ${formatDate(todo.dueDate)}` : ''}</span>{data?.canManage && <Button size="sm" variant="ghost" onClick={() => openEditTodo(todo)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}</span>
            </div>;
          })}
          {children.map((child) => renderFacility(child, depth + 1))}
        </div>}
      </div>
    );
  }

  if (loading) return <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-500">Loading Oracle facilities…</div>;
  if (!data) return <div className="rounded-lg border border-red-200 p-8 text-center text-sm text-red-600">Facilities data is unavailable.</div>;

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-medium text-slate-800">Facility hierarchy and recurring work</p><p className="text-sm text-slate-500">Expand any facility to view nested areas and operational to-dos.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.open('/workspace/building-facilities/maintenance', '_blank', 'noopener,noreferrer')}><CalendarDays className="h-4 w-4" /> Maintenance Page</Button>
        {data.canManage && <><Button variant="outline" onClick={() => setPersonnelOpen(true)}><UserPlus className="h-4 w-4" /> Add Personnel</Button><Button onClick={() => openAddFacility()}><Plus className="h-4 w-4" /> Add Facility</Button></>}
      </div>
    </div>
    <div className="space-y-3">{(childrenByParent.get('ROOT') ?? []).map((facility) => renderFacility(facility))}</div>

    <Dialog open={!!facilityDialog} onClose={() => setFacilityDialog(null)} title={facilityDialog?.editing ? 'Edit Facility' : facilityDialog?.parent ? `Add under ${facilityDialog.parent.name}` : 'Add Facility'} footer={<div className="flex w-full items-center justify-between gap-2">{facilityDialog?.editing ? <Button variant="destructive" onClick={removeFacility} disabled={saving}>Delete Facility</Button> : <span />}<span className="flex gap-2"><Button variant="outline" onClick={() => setFacilityDialog(null)}>Cancel</Button><Button onClick={saveFacility} disabled={saving || !facilityForm.name.trim()}>{saving ? 'Saving…' : 'Save Facility'}</Button></span></div>}>
      <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label required>Name</Label><Input value={facilityForm.name} onChange={(e) => setFacilityForm((v) => ({ ...v, name: e.target.value }))} /></div><div><Label>Type</Label><Select value={facilityForm.type} onChange={(e) => setFacilityForm((v) => ({ ...v, type: e.target.value }))}>{FACILITY_TYPES.map((value) => <option key={value}>{value}</option>)}</Select></div><div><Label>Location</Label><Input value={facilityForm.location} onChange={(e) => setFacilityForm((v) => ({ ...v, location: e.target.value }))} /></div><div className="sm:col-span-2"><Label>Information</Label><Textarea value={facilityForm.description} onChange={(e) => setFacilityForm((v) => ({ ...v, description: e.target.value }))} /></div></div>
    </Dialog>
    <Dialog open={personnelOpen} onClose={() => setPersonnelOpen(false)} title="Add Worker / Personnel" footer={<><Button variant="outline" onClick={() => setPersonnelOpen(false)}>Cancel</Button><Button onClick={savePersonnel} disabled={saving || !personnelForm.name.trim()}>{saving ? 'Saving…' : 'Add Personnel'}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label required>Name</Label><Input value={personnelForm.name} onChange={(e) => setPersonnelForm((v) => ({ ...v, name: e.target.value }))} /></div><div><Label>Employee No.</Label><Input value={personnelForm.employeeNo} onChange={(e) => setPersonnelForm((v) => ({ ...v, employeeNo: e.target.value }))} /></div><div><Label>Position</Label><Input value={personnelForm.position} onChange={(e) => setPersonnelForm((v) => ({ ...v, position: e.target.value }))} /></div><div className="sm:col-span-2"><Label>Contact Information</Label><Input value={personnelForm.contact} onChange={(e) => setPersonnelForm((v) => ({ ...v, contact: e.target.value }))} /></div></div>
    </Dialog>
    <Dialog open={!!todoFacility} onClose={() => { setTodoFacility(null); setEditingTodo(null); }} title={`${editingTodo ? 'Edit' : 'Add'} To-do${todoFacility ? ` — ${todoFacility.name}` : ''}`} size="lg" footer={<div className="flex w-full items-center justify-between gap-2">{editingTodo ? <Button variant="destructive" onClick={removeTodo} disabled={saving}>Delete To-do</Button> : <span />}<span className="flex gap-2"><Button variant="outline" onClick={() => { setTodoFacility(null); setEditingTodo(null); }}>Cancel</Button><Button onClick={saveTodo} disabled={saving || !todoForm.title.trim() || (todoForm.frequency === 'Custom' && !todoForm.customDays.length)}>{saving ? 'Saving…' : editingTodo ? 'Save Changes' : 'Add To-do'}</Button></span></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label required>Task</Label><Input list="bfm-todo-title-suggestions" value={todoForm.title} onChange={(e) => updateTodoTitle(e.target.value)} autoComplete="off" /><datalist id="bfm-todo-title-suggestions">{todoTemplates.map((template) => <option key={template.id} value={template.title}>{template.category} · {template.frequency}</option>)}</datalist><p className="mt-1 text-xs text-slate-500">Choose a previously used task to reuse its usual category, frequency, priority, and description.</p></div>
        <div><Label>Category</Label><Select value={todoForm.category} onChange={(e) => setTodoForm((v) => ({ ...v, category: e.target.value }))}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select></div>
        <div><Label>Frequency</Label><Select value={todoForm.frequency} onChange={(e) => setTodoForm((v) => ({ ...v, frequency: e.target.value, customDays: e.target.value === 'Custom' ? v.customDays : [] }))}>{FREQUENCIES.map((value) => <option key={value}>{value}</option>)}</Select></div>
        {todoForm.frequency === 'Custom' && <div className="sm:col-span-2"><Label required>Scheduled Days</Label><div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">{WEEKDAYS.map(({ day, label }) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todoForm.customDays.includes(day)} onChange={(event) => setTodoForm((current) => ({ ...current, customDays: event.target.checked ? [...current.customDays, day].sort((a, b) => a - b) : current.customDays.filter((value) => value !== day) }))} />{label}</label>)}</div></div>}
        <div><Label>Priority</Label><Select value={todoForm.priority} onChange={(e) => setTodoForm((v) => ({ ...v, priority: e.target.value }))}>{['Low','Normal','High','Urgent'].map((value) => <option key={value}>{value}</option>)}</Select></div>
        <div><Label>Due Date</Label><Input type="date" value={todoForm.dueDate} onChange={(e) => setTodoForm((v) => ({ ...v, dueDate: e.target.value }))} /></div>
        <div className="sm:col-span-2"><Label>Description</Label><Textarea value={todoForm.description} onChange={(e) => setTodoForm((v) => ({ ...v, description: e.target.value }))} /></div>
        <div className="sm:col-span-2"><Label>Assigned Workers / Personnel</Label><div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{data.personnel.length ? data.personnel.map((person) => <label key={person.id} className="flex items-center gap-2 rounded p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={todoForm.workerIds.includes(person.id)} onChange={(e) => setTodoForm((v) => ({ ...v, workerIds: e.target.checked ? [...v.workerIds, person.id] : v.workerIds.filter((id) => id !== person.id) }))} /><span>{person.name}{person.position ? ` — ${person.position}` : ''}</span></label>) : <p className="p-2 text-sm text-slate-500">Add personnel first to assign workers.</p>}</div></div>
      </div>
    </Dialog>
    <Dialog open={!!statusTodo} onClose={() => setStatusTodo(null)} title={statusTodo ? `Update — ${statusTodo.title}` : 'Update Task'} footer={<><Button variant="outline" onClick={() => setStatusTodo(null)}>Cancel</Button><Button onClick={saveStatus} disabled={saving}>{saving ? 'Saving…' : 'Save Update'}</Button></>}>
      <div className="space-y-4"><div><Label>Status</Label><Select value={statusForm.status} onChange={(e) => setStatusForm((v) => ({ ...v, status: e.target.value as BfmTodoStatus }))}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</Select></div><div><Label>Work performed by / on behalf of</Label><Select value={statusForm.workerId} onChange={(e) => setStatusForm((v) => ({ ...v, workerId: e.target.value }))}><option value="">Not specified</option>{data.personnel.map((person) => <option key={person.id} value={person.id}>{person.name}{person.position ? ` — ${person.position}` : ''}</option>)}</Select></div><div><Label>Work Note</Label><Textarea value={statusForm.note} onChange={(e) => setStatusForm((v) => ({ ...v, note: e.target.value }))} placeholder="Describe work completed, findings, or reason for deferral." /></div><p className="text-xs text-slate-500">The signed-in user and update time will be recorded automatically.</p></div>
    </Dialog>
  </>;
}
