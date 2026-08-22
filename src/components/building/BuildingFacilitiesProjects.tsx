import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Building2, CalendarClock, CalendarRange, ChevronDown, ChevronRight, MapPin, Pencil, Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createBfmFacility, createBfmProject, deleteBfmFacility, deleteBfmProject, fetchBfmOperations, updateBfmFacility, updateBfmProject, type BfmFacility, type BfmOperationsData, type BfmProject } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

const emptyFacility = { name: '', type: 'Building', description: '', location: '' };
const emptyProject = { title: '', description: '', category: 'General', priority: 'Normal', status: 'Planned', startDate: '', targetDate: '', budgetAmount: '', budgetStatus: 'For Budgeting', workerIds: [] as string[] };

export function BuildingFacilitiesProjects() {
  const { token } = useAuth();

  const { toast } = useToast();
  const [data, setData] = useState<BfmOperationsData | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [facilityParent, setFacilityParent] = useState<BfmFacility | null | undefined>(undefined);
  const [editingFacility, setEditingFacility] = useState<BfmFacility | null>(null);
  const [facilityForm, setFacilityForm] = useState(emptyFacility);
  const [projectFacility, setProjectFacility] = useState<BfmFacility | null>(null);
  const [editingProject, setEditingProject] = useState<BfmProject | null>(null);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchBfmOperations(token).then((next) => { setData(next); setExpanded(new Set(next.facilities.filter((item) => !item.parentId).map((item) => item.id))); }).catch((error) => toast({ kind: 'error', title: 'Unable to load projects', description: error instanceof Error ? error.message : 'Please try again.' })); }, [token, toast]);
  const children = useMemo(() => { const map = new Map<string, BfmFacility[]>(); for (const item of data?.facilities ?? []) { const key = item.parentId ?? 'ROOT'; map.set(key, [...(map.get(key) ?? []), item]); } return map; }, [data?.facilities]);
  const projects = useMemo(() => { const map = new Map<string, BfmProject[]>(); for (const item of data?.projects ?? []) map.set(item.facilityId, [...(map.get(item.facilityId) ?? []), item]); return map; }, [data?.projects]);
  const replace = (next: BfmOperationsData) => setData((current) => ({ ...next, canManage: current?.canManage }));

  async function saveFacility() {
    if (!facilityForm.name.trim()) return;
    setSaving(true);
    try {
      const next = editingFacility
        ? await updateBfmFacility(token, editingFacility.id, facilityForm)
        : await createBfmFacility(token, { ...facilityForm, parentId: facilityParent?.id });
      replace(next);
      if (facilityParent) setExpanded((value) => new Set(value).add(facilityParent.id));
      setFacilityParent(undefined); setEditingFacility(null); setFacilityForm(emptyFacility);
    }
    catch (error) { toast({ kind: 'error', title: `Unable to ${editingFacility ? 'update' : 'add'} facility`, description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); }
  }
  function openAddFacility(parent: BfmFacility | null) { setEditingFacility(null); setFacilityParent(parent); setFacilityForm({ ...emptyFacility, type: parent ? 'Area' : 'Building' }); }
  function openEditFacility(facility: BfmFacility) { setEditingFacility(facility); setFacilityParent(undefined); setFacilityForm({ name: facility.name, type: facility.type, description: facility.description, location: facility.location }); }
  function closeFacilityDialog() { setFacilityParent(undefined); setEditingFacility(null); }
  async function removeFacility() {
    if (!editingFacility || !window.confirm(`Delete ${editingFacility.name} and every child facility, project, to-do, and maintenance record under it? This cannot be undone.`)) return;
    setSaving(true);
    try { replace(await deleteBfmFacility(token, editingFacility.id)); closeFacilityDialog(); toast({ kind: 'success', title: 'Facility deleted', description: `${editingFacility.name} and its child records were deleted from Oracle.` }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete facility', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }
  function openProject(facility: BfmFacility, project?: BfmProject) { setProjectFacility(facility); setEditingProject(project ?? null); setProjectForm(project ? { title: project.title, description: project.description, category: project.category, priority: project.priority, status: project.status, startDate: project.startDate, targetDate: project.targetDate, budgetAmount: project.budgetAmount == null ? '' : String(project.budgetAmount), budgetStatus: project.budgetStatus, workerIds: [...project.workerIds] } : emptyProject); }
  async function saveProject() {
    if (!projectFacility || !projectForm.title.trim() || !projectForm.targetDate) return;
    setSaving(true);
    try { const payload = { ...projectForm, startDate: projectForm.startDate || projectForm.targetDate, budgetAmount: projectForm.budgetAmount.trim() ? Number(projectForm.budgetAmount) : null }; replace(editingProject ? await updateBfmProject(token, editingProject.id, payload) : await createBfmProject(token, { ...payload, facilityId: projectFacility.id })); setProjectFacility(null); setEditingProject(null); toast({ kind: 'success', title: editingProject ? 'Project updated' : 'Project added', description: 'Project information was saved in Oracle.' }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to save project', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); }
  }
  async function removeProject() {
    if (!editingProject || !window.confirm(`Delete project ${editingProject.title}? This cannot be undone.`)) return;
    setSaving(true);
    try { replace(await deleteBfmProject(token, editingProject.id)); setProjectFacility(null); setEditingProject(null); toast({ kind: 'success', title: 'Project deleted', description: 'The project was deleted from Oracle.' }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete project', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }
  function renderFacility(facility: BfmFacility, depth = 0): ReactNode {
    const childItems = children.get(facility.id) ?? [];
    const projectItems = projects.get(facility.id) ?? [];
    const open = expanded.has(facility.id);
    return (
      <div key={facility.id} className={depth ? 'ml-4 border-l border-slate-200 pl-3' : ''}>
        <div className="mb-2 rounded-lg border border-slate-200 bg-surface p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="flex min-w-0 items-start gap-2 text-left" onClick={() => setExpanded((value) => { const next = new Set(value); next.has(facility.id) ? next.delete(facility.id) : next.add(facility.id); return next; })}>
              {(childItems.length || projectItems.length) ? (open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />) : <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />}
              <span className="min-w-0"><span className="font-semibold text-slate-900">{facility.name}</span><span className="ml-2 text-xs text-slate-500">{facility.type}</span>{facility.location && <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{facility.location}</span>}{facility.description && <span className="mt-1 block text-xs text-slate-500">{facility.description}</span>}</span>
            </button>
            {data?.canManage && <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => openEditFacility(facility)}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button size="sm" variant="outline" onClick={() => openAddFacility(facility)}><Plus className="h-3.5 w-3.5" /> Sub-facility</Button><Button size="sm" onClick={() => openProject(facility)}><Plus className="h-3.5 w-3.5" /> Project</Button></div>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Last updated by {facility.updatedBy} · {formatDateTime(facility.updatedAt)}</p>
        </div>
        {open && <div className="space-y-2">
          {projectItems.map((project) => <div key={project.id} className="ml-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3 sm:flex-row sm:items-start sm:justify-between"><span><span className="font-medium">{project.title}</span><span className="mt-1 flex flex-wrap gap-1"><Badge>{project.status}</Badge><Badge>{project.priority}</Badge><Badge>{project.category}</Badge><Badge>{project.budgetStatus}</Badge></span>{project.budgetAmount != null && <span className="mt-1 block text-xs font-medium text-slate-600">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(project.budgetAmount)}</span>}{project.description && <span className="mt-1 block text-xs text-slate-500">{project.description}</span>}</span><span className="flex shrink-0 items-center gap-2"><span className="text-xs text-slate-500"><CalendarClock className="mr-1 inline h-3.5 w-3.5" />Target {formatDate(project.targetDate)}</span>{data?.canManage && <Button size="sm" variant="ghost" onClick={() => openProject(facility, project)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}</span></div>)}
          {childItems.map((child) => renderFacility(child, depth + 1))}
        </div>}
      </div>
    );
  }
  if (!data) return <p className="p-8 text-center text-sm text-slate-500">Loading Oracle projects…</p>;
  return <><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Facility hierarchy and project work</p><p className="text-sm text-slate-500">Expand any facility to view nested areas and non-routine projects with target dates.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => window.open('/workspace/building-facilities/program-of-works', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Program of Works</Button>{data.canManage && <Button onClick={() => openAddFacility(null)}><Plus className="h-4 w-4" /> Add Facility</Button>}</div></div><div className="space-y-3">{(children.get('ROOT') ?? []).map((facility) => renderFacility(facility))}</div>
  <Dialog open={facilityParent !== undefined || Boolean(editingFacility)} onClose={closeFacilityDialog} title={editingFacility ? 'Edit Facility' : facilityParent ? `Add under ${facilityParent.name}` : 'Add Facility'} footer={<div className="flex w-full items-center justify-between gap-2">{editingFacility ? <Button variant="destructive" onClick={removeFacility} disabled={saving}>Delete Facility</Button> : <span />}<span className="flex gap-2"><Button variant="outline" onClick={closeFacilityDialog}>Cancel</Button><Button disabled={saving || !facilityForm.name.trim()} onClick={saveFacility}>{saving ? 'Saving…' : 'Save Facility'}</Button></span></div>}><div className="space-y-4"><div><Label required>Name</Label><Input value={facilityForm.name} onChange={(event) => setFacilityForm((value) => ({ ...value, name: event.target.value }))} /></div><div><Label>Type</Label><Select value={facilityForm.type} onChange={(event) => setFacilityForm((value) => ({ ...value, type: event.target.value }))}>{['Facility Group','Building','Substation','Floor','Room','Area','Office','Warehouse','Other'].map((value) => <option key={value}>{value}</option>)}</Select></div><div><Label>Location</Label><Input value={facilityForm.location} onChange={(event) => setFacilityForm((value) => ({ ...value, location: event.target.value }))} /></div><div><Label>Information</Label><Textarea value={facilityForm.description} onChange={(event) => setFacilityForm((value) => ({ ...value, description: event.target.value }))} /></div></div></Dialog>
  <Dialog open={Boolean(projectFacility)} onClose={() => setProjectFacility(null)} title={`${editingProject ? 'Edit' : 'Add'} Project${projectFacility ? ` — ${projectFacility.name}` : ''}`} size="lg" footer={<div className="flex w-full items-center justify-between gap-2">{editingProject ? <Button variant="destructive" onClick={removeProject} disabled={saving}>Delete Project</Button> : <span />}<span className="flex gap-2"><Button variant="outline" onClick={() => setProjectFacility(null)}>Cancel</Button><Button disabled={saving || !projectForm.title.trim() || !projectForm.targetDate} onClick={saveProject}>{saving ? 'Saving…' : 'Save Project'}</Button></span></div>}><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label required>Project</Label><Input value={projectForm.title} onChange={(event) => setProjectForm((value) => ({ ...value, title: event.target.value }))} /></div><div><Label>Category</Label><Input value={projectForm.category} onChange={(event) => setProjectForm((value) => ({ ...value, category: event.target.value }))} /></div><div><Label>Status</Label><Select value={projectForm.status} onChange={(event) => setProjectForm((value) => ({ ...value, status: event.target.value }))}>{['Planned','In Progress','On Hold','Completed','Cancelled'].map((value) => <option key={value}>{value}</option>)}</Select></div><div><Label>Priority</Label><Select value={projectForm.priority} onChange={(event) => setProjectForm((value) => ({ ...value, priority: event.target.value }))}>{['Low','Normal','High','Urgent'].map((value) => <option key={value}>{value}</option>)}</Select></div><div><Label>Budget Amount</Label><Input type="number" min="0" step="0.01" placeholder="0.00" value={projectForm.budgetAmount} onChange={(event) => setProjectForm((value) => ({ ...value, budgetAmount: event.target.value }))} /></div><div><Label>Budget Status</Label><Select value={projectForm.budgetStatus} onChange={(event) => setProjectForm((value) => ({ ...value, budgetStatus: event.target.value }))}>{['Available','For Realignment','For Budgeting'].map((value) => <option key={value}>{value}</option>)}</Select></div><DateRangePicker required label="Tentative Schedule" startDate={projectForm.startDate} endDate={projectForm.targetDate} onChange={(startDate, targetDate) => setProjectForm((value) => ({ ...value, startDate, targetDate }))} /><div className="sm:col-span-2"><Label>Description</Label><Textarea value={projectForm.description} onChange={(event) => setProjectForm((value) => ({ ...value, description: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Assigned Workers / Personnel</Label><div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{data.personnel.map((person) => <label key={person.id} className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={projectForm.workerIds.includes(person.id)} onChange={(event) => setProjectForm((value) => ({ ...value, workerIds: event.target.checked ? [...value.workerIds, person.id] : value.workerIds.filter((id) => id !== person.id) }))} />{person.name}</label>)}</div></div></div></Dialog></>;
}
