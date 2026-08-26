import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { fetchMemberOperations, saveMemberOperations, type MemberOperationsActivity, type MemberOperationsProgram } from '@/lib/api';

type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Custom';

type ProgramActivity = MemberOperationsActivity;
type ProgramNode = MemberOperationsProgram;

const STORAGE_KEY = 'bes:member-programs:operations:v1';
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FREQUENCIES: Frequency[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Custom'];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateProgram(nodes: ProgramNode[], id: string, updater: (node: ProgramNode) => ProgramNode): ProgramNode[] {
  return nodes.map((node) => node.id === id ? updater(node) : { ...node, children: updateProgram(node.children, id, updater) });
}

function findProgram(nodes: ProgramNode[], id: string): ProgramNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findProgram(node.children, id);
    if (child) return child;
  }
  return undefined;
}

function removeProgram(nodes: ProgramNode[], id: string): ProgramNode[] {
  return nodes.filter((node) => node.id !== id).map((node) => ({ ...node, children: removeProgram(node.children, id) }));
}

function ProgramBranch({ node, depth, onSubProgram, onActivity, onEditProgram, onEditActivity }: {
  node: ProgramNode;
  depth: number;
  onSubProgram: (id: string) => void;
  onActivity: (id: string) => void;
  onEditProgram: (program: ProgramNode) => void;
  onEditActivity: (programId: string, activity: ProgramActivity) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasContents = node.children.length > 0 || node.activities.length > 0;
  return (
    <div className={depth ? 'ml-4 border-l border-slate-200 pl-4' : ''}>
      <div className="rounded-lg border border-slate-200 bg-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setExpanded((value) => !value)}>
            {hasContents ? (expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />) : <span className="w-4" />}
            <FolderTree className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="truncate font-semibold text-slate-900">{node.title}</span>
          </button>
          <div className="flex flex-wrap gap-2">
            <Button size="icon" variant="ghost" aria-label={`Edit ${node.title}`} title="Edit program" onClick={() => onEditProgram(node)}><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => onSubProgram(node.id)}><Plus className="h-3.5 w-3.5" /> Sub-program</Button>
            <Button size="sm" onClick={() => onActivity(node.id)}><Plus className="h-3.5 w-3.5" /> Activity</Button>
          </div>
        </div>
        {expanded && node.activities.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {node.activities.map((activity) => <div key={activity.id} className="rounded-md bg-slate-50 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-sm font-medium text-slate-800">{activity.name}</p>{activity.description && <p className="mt-0.5 text-xs text-slate-500">{activity.description}</p>}</div>
              <div className="flex items-center gap-1"><span className="rounded-full border border-slate-200 bg-surface px-2 py-0.5 text-xs text-slate-600">{activity.frequency === 'Custom' && activity.uniformTime === false ? 'Different times' : activity.timeFrom && activity.timeTo ? `${activity.timeFrom}–${activity.timeTo}` : 'Time not set'}</span><span className="rounded-full border border-slate-200 bg-surface px-2 py-0.5 text-xs text-slate-600">{activity.frequency}</span><Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit ${activity.name}`} title="Edit activity" onClick={() => onEditActivity(node.id, activity)}><Pencil className="h-3.5 w-3.5" /></Button></div>
            </div>
            {activity.frequency === 'Custom' && activity.weekdays.length > 0 && <div className="mt-1 text-xs text-slate-500">{activity.uniformTime === false ? activity.weekdays.map((day) => <span key={day} className="mr-3 inline-block">{day}: {activity.dayTimes?.[day]?.from || '—'}–{activity.dayTimes?.[day]?.to || '—'}</span>) : activity.weekdays.join(', ')}</div>}
          </div>)}
        </div>}
      </div>
      {expanded && node.children.length > 0 && <div className="mt-2 space-y-2">{node.children.map((child) => <ProgramBranch key={child.id} node={child} depth={depth + 1} onSubProgram={onSubProgram} onActivity={onActivity} onEditProgram={onEditProgram} onEditActivity={onEditActivity} />)}</div>}
    </div>
  );
}

export function MemberProgramsOperations() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<ProgramNode[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [programDialog, setProgramDialog] = useState<{ open: boolean; parentId: string | null; editId: string | null }>({ open: false, parentId: null, editId: null });
  const [programTitle, setProgramTitle] = useState('');
  const [activityProgramId, setActivityProgramId] = useState<string | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('Daily');
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [timeFrom, setTimeFrom] = useState('08:00');
  const [timeTo, setTimeTo] = useState('17:00');
  const [uniformTime, setUniformTime] = useState(true);
  const [dayTimes, setDayTimes] = useState<Record<string, { from: string; to: string }>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'program' | 'activity'; programId: string; activityId?: string; label: string } | null>(null);

  useEffect(() => { if (!token) return; let cancelled = false; fetchMemberOperations(token).then(async (oraclePrograms) => { if (cancelled) return; let browserPrograms: ProgramNode[] = []; try { browserPrograms = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ProgramNode[]; } catch { browserPrograms = []; } if (!oraclePrograms.length && browserPrograms.length) { await saveMemberOperations(token, browserPrograms); if (!cancelled) setPrograms(browserPrograms); } else if (!cancelled) setPrograms(oraclePrograms); if (!cancelled) { setHydrated(true); localStorage.removeItem(STORAGE_KEY); } }).catch((error) => toast({ kind: 'error', title: 'Operations not loaded', description: error instanceof Error ? error.message : 'Please try again.' })); return () => { cancelled = true; }; }, [token, toast]);
  useEffect(() => { if (!hydrated || !token) return; const timer = window.setTimeout(() => { void saveMemberOperations(token, programs).catch((error) => toast({ kind: 'error', title: 'Operations not saved', description: error instanceof Error ? error.message : 'Please try again.' })); }, 150); return () => window.clearTimeout(timer); }, [hydrated, programs, token, toast]);
  const activityOpen = activityProgramId !== null;
  const programDialogTitle = useMemo(() => programDialog.editId ? 'Edit Program' : programDialog.parentId ? 'Add Sub-program' : 'Add Program', [programDialog.editId, programDialog.parentId]);
  const usesIndividualDayTimes = frequency === 'Custom' && !uniformTime;
  const scheduleInvalid = usesIndividualDayTimes
    ? weekdays.some((day) => !dayTimes[day]?.from || !dayTimes[day]?.to || dayTimes[day].from >= dayTimes[day].to)
    : !timeFrom || !timeTo || timeFrom >= timeTo;

  function openProgram(parentId: string | null) {
    setProgramTitle('');
    setProgramDialog({ open: true, parentId, editId: null });
  }

  function editProgram(program: ProgramNode) {
    setProgramTitle(program.title);
    setProgramDialog({ open: true, parentId: null, editId: program.id });
  }

  function saveProgram() {
    const title = programTitle.trim();
    if (!title) return;
    if (programDialog.editId) {
      setPrograms((current) => updateProgram(current, programDialog.editId!, (node) => ({ ...node, title })));
    } else {
      const program: ProgramNode = { id: makeId('program'), title, children: [], activities: [] };
      setPrograms((current) => programDialog.parentId ? updateProgram(current, programDialog.parentId, (node) => ({ ...node, children: [...node.children, program] })) : [...current, program]);
    }
    setProgramDialog({ open: false, parentId: null, editId: null });
  }

  function openActivity(programId: string) {
    setActivityName(''); setActivityDescription(''); setFrequency('Daily'); setWeekdays([]); setTimeFrom('08:00'); setTimeTo('17:00'); setUniformTime(true); setDayTimes({}); setEditingActivityId(null);
    setActivityProgramId(programId);
  }

  function editActivity(programId: string, activity: ProgramActivity) {
    setActivityName(activity.name); setActivityDescription(activity.description); setFrequency(activity.frequency); setWeekdays(activity.weekdays); setTimeFrom(activity.timeFrom || '08:00'); setTimeTo(activity.timeTo || '17:00'); setUniformTime(activity.uniformTime !== false); setDayTimes(activity.dayTimes ?? {}); setEditingActivityId(activity.id);
    setActivityProgramId(programId);
  }

  function saveActivity() {
    if (!activityProgramId || !activityName.trim()) return;
    if (scheduleInvalid) return;
    const activity: ProgramActivity = { id: editingActivityId ?? makeId('activity'), name: activityName.trim(), description: activityDescription.trim(), frequency, weekdays: frequency === 'Custom' ? weekdays : [], timeFrom, timeTo, uniformTime: frequency !== 'Custom' || uniformTime, dayTimes: usesIndividualDayTimes ? Object.fromEntries(weekdays.map((day) => [day, dayTimes[day]])) : {} };
    setPrograms((current) => updateProgram(current, activityProgramId, (node) => ({ ...node, activities: editingActivityId ? node.activities.map((item) => item.id === editingActivityId ? activity : item) : [...node.activities, activity] })));
    setActivityProgramId(null);
    setEditingActivityId(null);
  }

  function requestProgramDelete() {
    if (!programDialog.editId) return;
    const program = findProgram(programs, programDialog.editId);
    if (!program) return;
    if (program.children.length || program.activities.length) {
      toast({ kind: 'error', title: 'Program cannot be deleted', description: 'Delete all activities and sub-programs under this program first. Child data will not be deleted automatically.' });
      return;
    }
    setDeleteTarget({ type: 'program', programId: program.id, label: program.title });
  }

  function requestActivityDelete() {
    if (!activityProgramId || !editingActivityId) return;
    setDeleteTarget({ type: 'activity', programId: activityProgramId, activityId: editingActivityId, label: activityName });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'program') {
      const program = findProgram(programs, deleteTarget.programId);
      if (!program || program.children.length || program.activities.length) {
        setDeleteTarget(null);
        toast({ kind: 'error', title: 'Program cannot be deleted', description: 'Delete all activities and sub-programs first.' });
        return;
      }
      setPrograms((current) => removeProgram(current, deleteTarget.programId));
      setProgramDialog({ open: false, parentId: null, editId: null });
    } else if (deleteTarget.activityId) {
      setPrograms((current) => updateProgram(current, deleteTarget.programId, (node) => ({ ...node, activities: node.activities.filter((activity) => activity.id !== deleteTarget.activityId) })));
      setActivityProgramId(null);
      setEditingActivityId(null);
    }
    toast({ kind: 'success', title: 'Deleted', description: `${deleteTarget.label} was deleted.` });
    setDeleteTarget(null);
  }

  return <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle>Operations</CardTitle><p className="mt-1 text-sm text-slate-500">Organize programs, nested sub-programs, and recurring activities.</p></div>
        <Button onClick={() => openProgram(null)}><Plus className="h-4 w-4" /> Add Program</Button>
      </CardHeader>
      <CardContent>
        {programs.length ? <div className="space-y-3">{programs.map((program) => <ProgramBranch key={program.id} node={program} depth={0} onSubProgram={(id) => openProgram(id)} onActivity={openActivity} onEditProgram={editProgram} onEditActivity={editActivity} />)}</div> : <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center">
          <FolderTree className="h-9 w-9 text-slate-400" /><p className="mt-3 font-medium text-slate-700">No programs yet</p><p className="mt-1 text-sm text-slate-500">Add the first program to begin the operations hierarchy.</p>
        </div>}
      </CardContent>
    </Card>

    <Dialog open={programDialog.open} onClose={() => setProgramDialog({ open: false, parentId: null, editId: null })} title={programDialogTitle} description="Define the title used in the program hierarchy." size="sm" footer={<>{programDialog.editId && <Button variant="destructive" onClick={requestProgramDelete}>Delete</Button>}<span className="flex-1" /><Button variant="outline" onClick={() => setProgramDialog({ open: false, parentId: null, editId: null })}>Cancel</Button><Button disabled={!programTitle.trim()} onClick={saveProgram}>{programDialog.editId ? 'Save Changes' : `Add ${programDialog.parentId ? 'Sub-program' : 'Program'}`}</Button></>}>
      <div><Label htmlFor="operations-program-title" required>Program title</Label><Input id="operations-program-title" value={programTitle} onChange={(event) => setProgramTitle(event.target.value)} placeholder="Enter program title" autoFocus onKeyDown={(event) => { if (event.key === 'Enter') saveProgram(); }} /></div>
    </Dialog>

    <Dialog open={activityOpen} onClose={() => { setActivityProgramId(null); setEditingActivityId(null); }} title={editingActivityId ? 'Edit Activity' : 'Add Activity'} description="Describe the work and how often it should be performed." size="md" footer={<>{editingActivityId && <Button variant="destructive" onClick={requestActivityDelete}>Delete</Button>}<span className="flex-1" /><Button variant="outline" onClick={() => { setActivityProgramId(null); setEditingActivityId(null); }}>Cancel</Button><Button disabled={!activityName.trim() || scheduleInvalid || (frequency === 'Custom' && weekdays.length === 0)} onClick={saveActivity}>{editingActivityId ? 'Save Changes' : 'Add Activity'}</Button></>}>
      <div className="space-y-4">
        <div><Label htmlFor="operations-activity-name" required>Name</Label><Input id="operations-activity-name" value={activityName} onChange={(event) => setActivityName(event.target.value)} placeholder="Activity name" autoFocus /></div>
        <div><Label htmlFor="operations-activity-description">Description</Label><Textarea id="operations-activity-description" value={activityDescription} onChange={(event) => setActivityDescription(event.target.value)} placeholder="Describe the activity, expected output, or instructions" /></div>
        <div><Label htmlFor="operations-activity-frequency" required>Frequency</Label><Select id="operations-activity-frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)}>{FREQUENCIES.map((item) => <option key={item}>{item}</option>)}</Select></div>
        {frequency === 'Custom' && <fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Days of the week <span className="text-red-600">*</span></legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{WEEKDAYS.map((day) => <label key={day} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700"><Checkbox checked={weekdays.includes(day)} onChange={(event) => { const checked = event.target.checked; setWeekdays((current) => checked ? [...current, day] : current.filter((item) => item !== day)); if (checked) setDayTimes((current) => ({ ...current, [day]: current[day] ?? { from: timeFrom || '08:00', to: timeTo || '17:00' } })); }} />{day}</label>)}</div></fieldset>}
        {frequency === 'Custom' && <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><Checkbox checked={uniformTime} onChange={(event) => setUniformTime(event.target.checked)} />Uniform time for all selected days</label>}
        {!usesIndividualDayTimes && <><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="operations-activity-time-from" required>From</Label><Input id="operations-activity-time-from" type="time" value={timeFrom} onChange={(event) => setTimeFrom(event.target.value)} /></div><div><Label htmlFor="operations-activity-time-to" required>To</Label><Input id="operations-activity-time-to" type="time" value={timeTo} min={timeFrom} onChange={(event) => setTimeTo(event.target.value)} /></div></div>{timeFrom && timeTo && timeFrom >= timeTo && <p className="text-xs text-red-600">The “To” time must be later than the “From” time.</p>}</>}
        {usesIndividualDayTimes && weekdays.length > 0 && <div className="space-y-3 rounded-lg border border-slate-200 p-3">{weekdays.map((day) => { const schedule = dayTimes[day] ?? { from: '08:00', to: '17:00' }; const invalid = !schedule.from || !schedule.to || schedule.from >= schedule.to; return <div key={day}><p className="mb-1 text-sm font-semibold text-slate-700">{day}</p><div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`operations-${day}-from`} required>From</Label><Input id={`operations-${day}-from`} type="time" value={schedule.from} onChange={(event) => setDayTimes((current) => ({ ...current, [day]: { ...schedule, from: event.target.value } }))} /></div><div><Label htmlFor={`operations-${day}-to`} required>To</Label><Input id={`operations-${day}-to`} type="time" min={schedule.from} value={schedule.to} onChange={(event) => setDayTimes((current) => ({ ...current, [day]: { ...schedule, to: event.target.value } }))} /></div></div>{invalid && <p className="mt-1 text-xs text-red-600">The “To” time must be later than the “From” time.</p>}</div>; })}</div>}
      </div>
    </Dialog>

    <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title={`Delete ${deleteTarget?.type === 'program' ? 'program' : 'activity'}?`} description={`Delete “${deleteTarget?.label ?? ''}”? This action cannot be undone.`} confirmLabel="Delete" destructive />
  </>;
}
