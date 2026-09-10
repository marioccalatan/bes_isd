import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, FolderTree, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createMemberProgramActivity, createMemberProgramType, deleteMemberProgram, fetchBarangayLocations, fetchMemberProgramActivities, fetchMemberPrograms, fetchMemberProgramTypes, saveMemberProgram, type BarangayLocation, type MemberProgram, type MemberProgramInput, type MemberProgramStatus } from '@/lib/api';

const STATUSES: MemberProgramStatus[] = ['Planned', 'Ongoing', 'Completed', 'On Hold', 'Cancelled'];
const STATUS_COLORS: Record<MemberProgramStatus, string> = { Planned: 'bg-blue-500', Ongoing: 'bg-emerald-500', Completed: 'bg-slate-500', 'On Hold': 'bg-amber-500', Cancelled: 'bg-red-500' };
const DEFAULT_PROGRAM_TYPES = ['Environmental Sustainability Program', 'Livelihood Program', 'Skills Training Program', 'Pailaw sa Paaralan', 'Reforestation Program', 'NGO Partnership for Social Cause', 'Other Projects', 'Linkages', 'Partnership', 'Networking'];
const today = new Date().toISOString().slice(0, 10);
const emptyForm: MemberProgramInput = { parentId: null, name: '', activity: '', description: '', address: '', municipality: '', barangay: '', district: '', startDate: today, endDate: today, status: 'Planned' };

function ProgramTypeGroup({ programType, programs, onEdit }: { programType: string; programs: MemberProgram[]; onEdit: (program: MemberProgram) => void }) {
  const [expanded, setExpanded] = useState(true);
  return <div className="rounded-lg border border-slate-200 bg-surface">
    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setExpanded((value) => !value)}>
      <span className="flex min-w-0 items-center gap-2"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? '' : '-rotate-90'}`} /><FolderTree className="h-4 w-4 text-brand-600" /><span className="truncate font-semibold text-slate-900">{programType}</span></span>
      <span className="text-sm text-slate-500">{programs.length} {programs.length === 1 ? 'program' : 'programs'}</span>
    </button>
    {expanded && <div className="space-y-2 border-t border-slate-200 p-3">{programs.map((program) => <ProgramRow key={program.id} program={program} onEdit={onEdit} />)}</div>}
  </div>;
}

function ProgramRow({ program, onEdit }: { program: MemberProgram; onEdit: (program: MemberProgram) => void }) {
  const title = program.activity || program.description || program.name;
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="font-semibold text-slate-900">{title}</p><div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500"><span>{program.startDate === program.endDate ? program.startDate : `${program.startDate} - ${program.endDate}`}</span>{program.municipality && <span>{[program.barangay, program.municipality, program.district].filter(Boolean).join(', ')}</span>}</div></div>
      <div className="flex items-center gap-2"><Badge>{program.status}</Badge><Button size="icon" variant="ghost" aria-label={`Edit ${title}`} onClick={() => onEdit(program)}><Pencil className="h-4 w-4" /></Button></div>
    </div>
    {program.description && program.description !== title && <p className="mt-2 text-sm text-slate-600">{program.description}</p>}
  </div>;
}

type MemberProgramsProgramsProps = { addDraft?: MemberProgramInput | null; onDraftConsumed?: () => void };

export function MemberProgramsPrograms({ addDraft, onDraftConsumed }: MemberProgramsProgramsProps) {
  const { token } = useAuth(); const { toast } = useToast();
  const [programs, setPrograms] = useState<MemberProgram[]>([]); const [locations, setLocations] = useState<BarangayLocation[]>([]); const [programTypes, setProgramTypes] = useState<string[]>([]); const [activities, setActivities] = useState<string[]>([]); const [open, setOpen] = useState(false); const [summaryOpen, setSummaryOpen] = useState(false); const [programTypeOpen, setProgramTypeOpen] = useState(false); const [activityOpen, setActivityOpen] = useState(false); const [newProgramType, setNewProgramType] = useState(''); const [newActivity, setNewActivity] = useState(''); const [editing, setEditing] = useState<MemberProgram | null>(null); const [form, setForm] = useState<MemberProgramInput>(emptyForm); const [singleDay, setSingleDay] = useState(true); const [saving, setSaving] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false);
  async function load() { if (!token) return; try { const [memberPrograms, barangayLocations] = await Promise.all([fetchMemberPrograms(token), fetchBarangayLocations(token)]); setPrograms(memberPrograms.map((program) => ({ ...program, activity: program.activity || '', parentId: null }))); setLocations(barangayLocations); try { const memberProgramTypes = await fetchMemberProgramTypes(token); setProgramTypes(memberProgramTypes); } catch { setProgramTypes([]); } try { const memberActivities = await fetchMemberProgramActivities(token); setActivities(memberActivities); } catch { setActivities([]); } } catch (error) { toast({ kind: 'error', title: 'Programs not loaded', description: error instanceof Error ? error.message : 'Please try again.' }); } }
  useEffect(() => { void load(); }, [token]);
  useEffect(() => { if (!addDraft) return; setEditing(null); setForm(addDraft); setSingleDay(addDraft.startDate === addDraft.endDate); setOpen(true); onDraftConsumed?.(); }, [addDraft, onDraftConsumed]);
  function add() { setEditing(null); setForm({ ...emptyForm }); setSingleDay(true); setOpen(true); }
  function edit(program: MemberProgram) { setEditing(program); setForm({ parentId: null, name: program.name, activity: program.activity || '', description: program.description, address: program.address, municipality: program.municipality, barangay: program.barangay, district: program.district, startDate: program.startDate, endDate: program.endDate, status: program.status }); setSingleDay(program.startDate === program.endDate); setOpen(true); }
  async function save() { if (!token || !form.name.trim() || !form.startDate || !form.endDate || form.endDate < form.startDate) return; setSaving(true); try { await saveMemberProgram(token, { ...form, parentId: null, name: form.name.trim(), activity: form.activity.trim(), description: form.description.trim(), address: form.address.trim(), endDate: singleDay ? form.startDate : form.endDate }, editing?.id); await load(); setOpen(false); toast({ kind: 'success', title: editing ? 'Program updated' : 'Program added', description: 'The tentative schedule was saved in the Programs database.' }); } catch (error) { toast({ kind: 'error', title: 'Program not saved', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  async function remove() { if (!token || !editing) return; setSaving(true); try { await deleteMemberProgram(token, editing.id); await load(); setDeleteOpen(false); setOpen(false); toast({ kind: 'success', title: 'Program deleted', description: 'The program and its child programs were removed.' }); } catch (error) { toast({ kind: 'error', title: 'Program not deleted', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSaving(false); } }
  const groupedPrograms = useMemo(() => Object.entries(programs.reduce<Record<string, MemberProgram[]>>((groups, program) => { const programType = program.name || 'Unspecified Program Type'; groups[programType] = [...(groups[programType] ?? []), program]; return groups; }, {})).sort(([a], [b]) => a.localeCompare(b)), [programs]);
  const allProgramTypes = useMemo(() => [...new Set([...DEFAULT_PROGRAM_TYPES, ...programTypes, ...programs.map((program) => program.name).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [programTypes, programs]);
  const allActivities = useMemo(() => [...new Set([...activities, ...programs.map((program) => program.activity).filter(Boolean)])].sort((a, b) => a.localeCompare(b)), [activities, programs]);
  const municipalities = useMemo(() => [...new Set(locations.map((item) => item.municipality).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [locations]);
  const barangays = useMemo(() => locations.filter((item) => item.municipality === form.municipality).sort((a, b) => a.barangay.localeCompare(b.barangay)), [locations, form.municipality]);
  function selectMunicipality(municipality: string) {
    const districtOptions = [...new Set(locations.filter((item) => item.municipality === municipality).map((item) => item.district).filter(Boolean))];
    setForm({ ...form, municipality, barangay: '', district: districtOptions.length === 1 ? districtOptions[0] : '' });
  }
  function selectBarangay(barangay: string) {
    const selected = locations.find((item) => item.municipality === form.municipality && item.barangay === barangay);
    setForm({ ...form, barangay, district: selected?.district ?? form.district });
  }
  async function addProgramType() {
    if (!token || !newProgramType.trim()) return;
    setSaving(true);
    try {
      const result = await createMemberProgramType(token, newProgramType.trim());
      await load();
      setForm({ ...form, name: result.programType });
      setNewProgramType('');
      setProgramTypeOpen(false);
      toast({ kind: 'success', title: 'Program type added' });
    } catch (error) {
      toast({ kind: 'error', title: 'Program type not saved', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }
  async function addActivity() {
    if (!token || !newActivity.trim()) return;
    setSaving(true);
    try {
      const result = await createMemberProgramActivity(token, newActivity.trim());
      await load();
      setForm({ ...form, activity: result.activity });
      setNewActivity('');
      setActivityOpen(false);
      toast({ kind: 'success', title: 'Activity added' });
    } catch (error) {
      toast({ kind: 'error', title: 'Activity not saved', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }
  const range = useMemo(() => { if (!programs.length) return { start: new Date(), days: 1 }; const dates = programs.flatMap((item) => [new Date(`${item.startDate}T00:00:00`), new Date(`${item.endDate}T00:00:00`)]); const start = new Date(Math.min(...dates.map(Number))); const end = new Date(Math.max(...dates.map(Number))); return { start, days: Math.max(1, Math.round((Number(end) - Number(start)) / 86400000) + 1) }; }, [programs]);
  return <>
    <Card><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Programs</CardTitle><p className="mt-1 text-sm text-slate-500">Program Type parent groups with individual programs underneath.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setSummaryOpen(true)}><BarChart3 className="h-4 w-4" /> Summary</Button><Button onClick={() => add()}><Plus className="h-4 w-4" /> Add Program</Button></div></CardHeader><CardContent>{groupedPrograms.length ? <div className="space-y-3">{groupedPrograms.map(([programType, grouped]) => <ProgramTypeGroup key={programType} programType={programType} programs={grouped} onEdit={edit} />)}</div> : <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center"><FolderTree className="h-9 w-9 text-slate-400" /><p className="mt-3 font-medium text-slate-700">No programs yet</p><p className="mt-1 text-sm text-slate-500">Add a program and its tentative schedule.</p></div>}</CardContent></Card>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} title={editing ? 'Edit Program' : 'Add Program'} description="Define this program and its tentative schedule." size="md" footer={<>{editing && <Button variant="destructive" disabled={saving} onClick={() => setDeleteOpen(true)}>Delete</Button>}<span className="flex-1" /><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={saving || !form.name.trim() || !form.startDate || !form.endDate || form.endDate < form.startDate} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Program'}</Button></>}><div className="space-y-4"><div><Label required>Program Type</Label><Select value={form.name} onChange={(event) => { if (event.target.value === '__create_program_type__') { setNewProgramType(''); setProgramTypeOpen(true); return; } setForm({ ...form, name: event.target.value }); }} autoFocus><option value="">Select program type</option>{form.name && !allProgramTypes.includes(form.name) ? <option value={form.name}>{form.name}</option> : null}{allProgramTypes.map((programType) => <option key={programType} value={programType}>{programType}</option>)}<option value="__create_program_type__">+ Create Program Type</option></Select></div><div><Label>Activity</Label><Select value={form.activity} onChange={(event) => { if (event.target.value === '__create_activity__') { setNewActivity(''); setActivityOpen(true); return; } setForm({ ...form, activity: event.target.value }); }}><option value="">Select activity</option>{form.activity && !allActivities.includes(form.activity) ? <option value={form.activity}>{form.activity}</option> : null}{allActivities.map((activity) => <option key={activity} value={activity}>{activity}</option>)}<option value="__create_activity__">+ Create Activity</option></Select></div><div><Label>Description</Label><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><div><Label>Address</Label><Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Street, sitio, purok, or venue address" /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Municipality</Label><Select value={form.municipality} onChange={(event) => selectMunicipality(event.target.value)}><option value="">Select municipality</option>{form.municipality && !municipalities.includes(form.municipality) ? <option value={form.municipality}>{form.municipality}</option> : null}{municipalities.map((municipality) => <option key={municipality} value={municipality}>{municipality}</option>)}</Select></div><div><Label>Barangay</Label><Select value={form.barangay} disabled={!form.municipality} onChange={(event) => selectBarangay(event.target.value)}><option value="">{form.municipality ? 'Select barangay' : 'Select municipality first'}</option>{form.barangay && !barangays.some((item) => item.barangay === form.barangay) ? <option value={form.barangay}>{form.barangay}</option> : null}{barangays.map((item) => <option key={item.barangay} value={item.barangay}>{item.barangay}</option>)}</Select></div></div><div><Label>District</Label><Input value={form.district} readOnly placeholder="Filled from the selected municipality or barangay" /></div><div><Label>Status</Label><Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as MemberProgramStatus })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</Select></div><label className="flex items-center gap-2 text-sm text-slate-700"><Checkbox checked={singleDay} onChange={(event) => { setSingleDay(event.target.checked); if (event.target.checked) setForm({ ...form, endDate: form.startDate }); }} />Single-day program</label><div className="grid grid-cols-2 gap-3"><div><Label required>{singleDay ? 'Tentative Date' : 'Start Date'}</Label><Input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value, endDate: singleDay ? event.target.value : form.endDate })} /></div>{!singleDay && <div><Label required>End Date</Label><Input type="date" min={form.startDate} value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div>}</div>{!singleDay && form.endDate < form.startDate && <p className="text-xs text-red-600">End Date must be on or after Start Date.</p>}</div></Dialog>
    <Dialog open={programTypeOpen} onClose={() => !saving && setProgramTypeOpen(false)} title="Create Program Type" description="Add a reusable program type for future Programs records." size="sm" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setProgramTypeOpen(false)}>Cancel</Button><Button disabled={saving || !newProgramType.trim()} onClick={() => void addProgramType()}>{saving ? 'Creating…' : 'Create Program Type'}</Button></div>}><div><Label required>Program Type</Label><Input autoFocus value={newProgramType} onChange={(event) => setNewProgramType(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addProgramType(); } }} placeholder="Enter program type" /></div></Dialog>
    <Dialog open={activityOpen} onClose={() => !saving && setActivityOpen(false)} title="Create Activity" description="Add a reusable activity for future Programs records." size="sm" footer={<div className="flex w-full justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setActivityOpen(false)}>Cancel</Button><Button disabled={saving || !newActivity.trim()} onClick={() => void addActivity()}>{saving ? 'Creating…' : 'Create Activity'}</Button></div>}><div><Label required>Activity</Label><Input autoFocus value={newActivity} onChange={(event) => setNewActivity(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addActivity(); } }} placeholder="Enter activity" /></div></Dialog>
    <Dialog open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Programs Schedule Summary" description="Tentative Gantt chart for all parent and child programs." size="xl" footer={<Button variant="outline" onClick={() => setSummaryOpen(false)}>Close</Button>}><div className="space-y-2 overflow-x-auto">{programs.length ? programs.map((program) => { const start = Math.round((Number(new Date(`${program.startDate}T00:00:00`)) - Number(range.start)) / 86400000); const duration = Math.max(1, Math.round((Number(new Date(`${program.endDate}T00:00:00`)) - Number(new Date(`${program.startDate}T00:00:00`))) / 86400000) + 1); return <div key={program.id} className="grid min-w-[760px] grid-cols-[220px_1fr] items-center gap-3"><div><p className="truncate text-sm font-medium text-slate-800">{program.name}</p><p className="text-xs text-slate-500">{program.startDate}{program.startDate !== program.endDate ? ` – ${program.endDate}` : ''}</p></div><div className="relative h-9 rounded bg-slate-100"><div className={`absolute top-1 h-7 rounded px-2 text-xs leading-7 text-white ${STATUS_COLORS[program.status]}`} style={{ left: `${(start / range.days) * 100}%`, width: `${Math.max(2, (duration / range.days) * 100)}%` }}><span className="whitespace-nowrap">{program.status}</span></div></div></div>; }) : <p className="py-12 text-center text-sm text-slate-500">No scheduled programs to summarize.</p>}</div></Dialog>
    <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={() => void remove()} title="Delete program?" description={`Delete “${editing?.name ?? ''}” and all of its child programs?`} confirmLabel="Delete" destructive />
  </>;
}
