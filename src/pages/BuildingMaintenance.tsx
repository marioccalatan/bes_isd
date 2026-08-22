import { Fragment, useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ExternalLink, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { fetchBfmOperations, saveBfmWorkDetails, updateBfmTodoStatus, type BfmOperationsData, type BfmTodo } from '@/lib/api';

const emptyDetails = { findings: '', actionTaken: '', materialsUsed: '', recommendation: '' };

export default function BuildingMaintenance() {
  const { token, user } = useAuth();
  const { createTaskFromCalendarEvent } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<BfmOperationsData | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState('');
  const [facilityLevelOne, setFacilityLevelOne] = useState('');
  const [facilityLevelTwo, setFacilityLevelTwo] = useState('');
  const [activeWorkerId, setActiveWorkerId] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [detailsTarget, setDetailsTarget] = useState<{ todo: BfmTodo; workDate: string } | null>(null);
  const [detailsForm, setDetailsForm] = useState(emptyDetails);
  const [savingDetails, setSavingDetails] = useState(false);
  const [convertingDetails, setConvertingDetails] = useState(false);
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const isoWeekday = (date: Date) => ((date.getDay() + 6) % 7) + 1;

  useEffect(() => {
    let cancelled = false;
    fetchBfmOperations(token)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load maintenance page', description: error instanceof Error ? error.message : 'Please try again.' }); });
    return () => { cancelled = true; };
  }, [token, toast]);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const facilityById = useMemo(() => new Map((data?.facilities ?? []).map((facility) => [facility.id, facility])), [data?.facilities]);
  const personnelById = useMemo(() => new Map((data?.personnel ?? []).map((person) => [person.id, person])), [data?.personnel]);
  const rootFacilities = useMemo(() => (data?.facilities ?? [])
    .filter((facility) => !facility.parentId || !facilityById.has(facility.parentId))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)), [data?.facilities, facilityById]);
  const levelTwoFacilities = useMemo(() => (data?.facilities ?? [])
    .filter((facility) => facility.parentId === facilityLevelOne)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)), [data?.facilities, facilityLevelOne]);
  const isWithinFacility = (facilityId: string, ancestorId: string) => {
    let current = facilityById.get(facilityId);
    while (current) {
      if (current.id === ancestorId) return true;
      current = current.parentId ? facilityById.get(current.parentId) : undefined;
    }
    return false;
  };
  const countTodosWithin = (facilityId: string) => (data?.todos ?? []).filter((todo) => isWithinFacility(todo.facilityId, facilityId)).length;
  useEffect(() => {
    if (!rootFacilities.length) return;
    if (!rootFacilities.some((facility) => facility.id === facilityLevelOne)) {
      setFacilityLevelOne((rootFacilities.find((facility) => facility.name.toLowerCase().startsWith('building')) ?? rootFacilities[0]).id);
    }
  }, [rootFacilities, facilityLevelOne]);
  useEffect(() => {
    if (!facilityLevelOne) return;
    if (!levelTwoFacilities.some((facility) => facility.id === facilityLevelTwo)) {
      setFacilityLevelTwo(levelTwoFacilities[0]?.id ?? facilityLevelOne);
    }
  }, [facilityLevelOne, facilityLevelTwo, levelTwoFacilities]);
  const facilityPath = (facilityId: string) => {
    const names: string[] = [];
    let current = facilityById.get(facilityId);
    while (current) { names.unshift(current.name); current = current.parentId ? facilityById.get(current.parentId) : undefined; }
    return names.join(' › ');
  };
  const query = search.trim().toLowerCase();
  const selectedFacilityId = facilityLevelTwo || facilityLevelOne;
  const scopedTodos = useMemo(() => (data?.todos ?? []).filter((todo) => !selectedFacilityId || isWithinFacility(todo.facilityId, selectedFacilityId)), [data?.todos, facilityById, selectedFacilityId]);
  const todos = useMemo(() => scopedTodos.filter((todo) => !query || [todo.title, todo.category, todo.frequency, facilityPath(todo.facilityId)].some((value) => value.toLowerCase().includes(query))), [scopedTodos, query, facilityById]);
  const todoGroups = useMemo(() => {
    const groups = new Map<string, typeof todos>();
    for (const todo of todos) {
      const path = facilityPath(todo.facilityId) || 'Other Facilities';
      const items = groups.get(path) ?? [];
      items.push(todo);
      groups.set(path, items);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, items]) => ({ path, items: [...items].sort((left, right) => left.title.localeCompare(right.title)) }));
  }, [todos, facilityById]);
  const latestActivity = useMemo(() => {
    const result = new Map<string, NonNullable<BfmOperationsData['activity']>[number]>();
    for (const entry of data?.activity ?? []) {
      const key = `${entry.todoId}|${entry.workDate}`;
      if (!result.has(key)) result.set(key, entry);
    }
    return result;
  }, [data?.activity]);
  const workDetailsByKey = useMemo(() => new Map((data?.workDetails ?? []).map((detail) => [`${detail.todoId}|${detail.workDate}`, detail])), [data?.workDetails]);
  const facilityMetrics = useMemo(() => {
    const periodKey = (frequency: string, date: Date) => {
      const normalized = frequency.trim().toLowerCase();
      if (normalized === 'daily') return format(date, 'yyyy-MM-dd');
      if (normalized === 'weekly') return `W:${format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`;
      if (normalized === 'monthly') return `M:${format(date, 'yyyy-MM')}`;
      if (normalized === 'quarterly') return `Q:${date.getFullYear()}-${Math.floor(date.getMonth() / 3) + 1}`;
      if (normalized === 'semi-annual') return `H:${date.getFullYear()}-${date.getMonth() < 6 ? 1 : 2}`;
      if (normalized === 'annual') return `Y:${date.getFullYear()}`;
      if (normalized === 'custom') return format(date, 'yyyy-MM-dd');
      return '';
    };
    const latestByTodo = new Map<string, Array<NonNullable<BfmOperationsData['activity']>[number]>>();
    for (const entry of latestActivity.values()) {
      const entries = latestByTodo.get(entry.todoId) ?? [];
      entries.push(entry);
      latestByTodo.set(entry.todoId, entries);
    }
    const groups = new Map<string, { expected: number; accomplished: number }>();
    const elapsedDates = dates.filter((date) => format(date, 'yyyy-MM-dd') <= todayKey);
    for (const todo of scopedTodos) {
      const path = facilityPath(todo.facilityId).split(' › ').filter(Boolean);
      const groupName = path.slice(0, 2).join(' › ') || path[0] || 'Other Facilities';
      const applicableDates = todo.frequency === 'Custom' ? elapsedDates.filter((date) => todo.customDays.includes(isoWeekday(date))) : elapsedDates;
      const requiredPeriods = new Set(applicableDates.map((date) => periodKey(todo.frequency, date)).filter(Boolean));
      if (!requiredPeriods.size) continue;
      const completedPeriods = new Set(
        (latestByTodo.get(todo.id) ?? [])
          .filter((entry) => entry.newStatus === 'Completed' && entry.workDate)
          .map((entry) => periodKey(todo.frequency, new Date(`${entry.workDate}T12:00:00`)))
          .filter((key) => key && requiredPeriods.has(key)),
      );
      const metric = groups.get(groupName) ?? { expected: 0, accomplished: 0 };
      metric.expected += requiredPeriods.size;
      metric.accomplished += Math.min(completedPeriods.size, requiredPeriods.size);
      groups.set(groupName, metric);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, metric]) => ({
      name,
      ...metric,
      percentage: metric.expected ? Math.round((metric.accomplished / metric.expected) * 100) : 0,
    }));
  }, [scopedTodos, dates, facilityById, latestActivity, todayKey]);

  async function toggle(todoId: string, date: Date, completed: boolean) {
    if (!completed && !activeWorkerId) {
      toast({ kind: 'error', title: 'Select a worker', description: 'Choose the worker who performed the maintenance before updating the checklist.' });
      return;
    }
    const workDate = format(date, 'yyyy-MM-dd');
    const key = `${todoId}|${workDate}`;
    setSavingKey(key);
    try {
      const next = await updateBfmTodoStatus(token, todoId, {
        status: completed ? 'Pending' : 'Completed',
        workerId: completed ? undefined : activeWorkerId,
        workDate,
      });
      setData((current) => ({ ...next, canManage: current?.canManage }));
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update maintenance', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSavingKey(''); }
  }

  function openWorkDetails(todo: BfmTodo, workDate: string) {
    const existing = workDetailsByKey.get(`${todo.id}|${workDate}`);
    setDetailsTarget({ todo, workDate });
    setDetailsForm(existing ? {
      findings: existing.findings,
      actionTaken: existing.actionTaken,
      materialsUsed: existing.materialsUsed,
      recommendation: existing.recommendation,
    } : emptyDetails);
  }

  async function saveDetails() {
    if (!detailsTarget) return;
    setSavingDetails(true);
    try {
      const next = await saveBfmWorkDetails(token, detailsTarget.todo.id, { workDate: detailsTarget.workDate, ...detailsForm });
      setData((current) => ({ ...next, canManage: current?.canManage }));
      setDetailsTarget(null);
      toast({ kind: 'success', title: 'Maintenance details saved', description: 'The findings and work details were stored in Oracle.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save maintenance details', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSavingDetails(false); }
  }

  async function convertDetailsToTask() {
    if (!detailsTarget || !user) return;
    const existing = workDetailsByKey.get(`${detailsTarget.todo.id}|${detailsTarget.workDate}`);
    if (existing?.convertedTaskId) {
      setDetailsTarget(null);
      navigate(`/my-work/${encodeURIComponent(existing.convertedTaskId)}`);
      return;
    }
    setConvertingDetails(true);
    try {
      const path = facilityPath(detailsTarget.todo.facilityId);
      const description = [
        `Maintenance finding from ${path} on ${format(new Date(`${detailsTarget.workDate}T12:00:00`), 'MMMM d, yyyy')}.`,
        detailsForm.findings && `Findings:\n${detailsForm.findings}`,
        detailsForm.actionTaken && `Action Taken:\n${detailsForm.actionTaken}`,
        detailsForm.materialsUsed && `Materials Used:\n${detailsForm.materialsUsed}`,
        detailsForm.recommendation && `Recommendation:\n${detailsForm.recommendation}`,
      ].filter(Boolean).join('\n\n');
      const result = await createTaskFromCalendarEvent({
        calendarEventId: '',
        title: `Follow-up: ${detailsTarget.todo.title}`,
        description,
        assigneeUsername: user.username,
        departmentId: 'ISD',
        officeAssignment: user.unitName || 'General Services Office',
        taskSubject: 'Building and Facilities Management System',
        priority: detailsTarget.todo.priority,
      });
      if (!result.ok) throw new Error(result.error);
      const next = await saveBfmWorkDetails(token, detailsTarget.todo.id, {
        workDate: detailsTarget.workDate,
        ...detailsForm,
        convertedTaskId: result.task.id,
      });
      setData((current) => ({ ...next, canManage: current?.canManage }));
      setDetailsTarget(null);
      toast({ kind: 'success', title: 'Finding converted to task', description: `${result.task.id} now appears under the tool’s Tasks tab.` });
      navigate(`/my-work/${encodeURIComponent(result.task.id)}`);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to convert finding', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setConvertingDetails(false); }
  }

  return <div>
    <PageHeader title="Building and Facilities Maintenance" description="Weekly maintenance checklist for buildings, substations, rooms, areas, and equipment." crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'Building and Facilities Management', to: '/workspace/preview/ISD/tools/Building%20and%20Facilities%20Management%20System' }, { label: 'Maintenance' }]} />
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-brand-600" /> Maintenance Calendar</CardTitle><p className="mt-1 text-sm text-slate-500">Tick a date when work is completed. Every change records the signed-in user and assigned personnel.</p></div>
          <div className="flex items-center gap-2"><Button variant="outline" onClick={() => setWeekStart((date) => addWeeks(date, -1))}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This Week</Button><Button variant="outline" onClick={() => setWeekStart((date) => addWeeks(date, 1))}><ArrowRight className="h-4 w-4" /></Button></div>
        </div>
      </CardHeader>
      <CardContent>
        {rootFacilities.length > 0 && <div className="mb-5 space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Facility group</p>
            <Tabs
              tabs={rootFacilities.map((facility) => ({ value: facility.id, label: facility.name, count: countTodosWithin(facility.id) }))}
              value={facilityLevelOne}
              onChange={(value) => { setFacilityLevelOne(value); setFacilityLevelTwo(''); }}
              className="flex-wrap overflow-visible"
            />
          </div>
          {levelTwoFacilities.length > 0 && <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Facility</p>
            <Tabs
              tabs={levelTwoFacilities.map((facility) => ({ value: facility.id, label: facility.name, count: countTodosWithin(facility.id) }))}
              value={facilityLevelTwo}
              onChange={setFacilityLevelTwo}
              className="flex-wrap overflow-visible"
            />
          </div>}
        </div>}
        {facilityMetrics.length > 0 && <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {facilityMetrics.map((metric) => <div key={metric.name} className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-800">{metric.name}</p><p className="mt-0.5 text-xs text-slate-500">{metric.accomplished} of {metric.expected} required checks accomplished</p></div><span className="text-lg font-semibold text-brand-700">{metric.percentage}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${metric.percentage}%` }} /></div>
          </div>)}
        </div>}
        {facilityMetrics.length > 0 && <p className="-mt-2 mb-5 text-xs text-slate-500">Compliance is counted once per required facility task and frequency period. Repeated checks within the same period do not increase the percentage.</p>}
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input className="max-w-md" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search facility, task, category, frequency…" />
          <div className="min-w-[260px] max-w-sm flex-1">
            <label htmlFor="maintenance-worker" className="mb-1 block text-xs font-medium text-slate-500">Active Worker</label>
            <Select id="maintenance-worker" value={activeWorkerId} onChange={(event) => setActiveWorkerId(event.target.value)}>
              <option value="">Select worker</option>
              {(data?.personnel ?? []).map((person) => <option key={person.id} value={person.id}>{person.name}{person.position ? ` — ${person.position}` : ''}</option>)}
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead className="bg-slate-50"><tr><th className="sticky left-0 z-10 min-w-[330px] border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-left">Facility / Maintenance To-do</th><th className="min-w-[170px] border-b border-r border-slate-200 px-3 py-3 text-left">Schedule</th>{dates.map((date) => <th key={date.toISOString()} className={`min-w-[92px] border-b border-r border-slate-200 px-2 py-3 text-center ${format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'bg-brand-50 text-brand-700' : ''}`}><span className="block text-xs uppercase">{format(date, 'EEE')}</span><span className="block text-base">{format(date, 'MMM d')}</span></th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {todoGroups.map((group) => <Fragment key={group.path}>
                <tr className="bg-slate-50/80">
                  <td colSpan={9} className="border-b border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-700">{group.path}</span><Badge>{group.items.length} {group.items.length === 1 ? 'to-do' : 'to-dos'}</Badge></div>
                  </td>
                </tr>
                {group.items.map((todo) => {
                const workers = todo.workerIds.map((id) => personnelById.get(id)).filter(Boolean);
                return <tr key={todo.id} className="hover:bg-slate-50/60"><td className="sticky left-0 z-[1] border-r border-slate-200 bg-surface px-3 py-3"><p className="font-medium text-slate-800">{todo.title}</p>{workers.length > 0 && <p className="mt-1 text-[11px] text-slate-400">Personnel: {workers.map((worker) => worker!.name).join(', ')}</p>}</td><td className="border-r border-slate-200 px-3 py-3"><div className="flex flex-wrap gap-1"><Badge>{todo.category}</Badge><Badge>{todo.frequency}</Badge><Badge>{todo.priority}</Badge></div></td>{dates.map((date) => {
                  const workDate = format(date, 'yyyy-MM-dd');
                  const entry = latestActivity.get(`${todo.id}|${workDate}`);
                  const done = entry?.newStatus === 'Completed';
                  const isFuture = workDate > todayKey;
                  const isUnscheduled = todo.frequency === 'Custom' && !todo.customDays.includes(isoWeekday(date));
                  const isUnavailable = isFuture || isUnscheduled;
                  const key = `${todo.id}|${workDate}`;
                  const details = workDetailsByKey.get(key);
                  return <td key={workDate} onContextMenu={(event) => { event.preventDefault(); if (!isUnavailable) openWorkDetails(todo, workDate); }} title={isFuture ? 'This date is not available yet' : isUnscheduled ? 'Not scheduled for this weekday' : 'Right-click to add findings and work details'} className={`relative border-r border-slate-200 px-2 py-3 text-center ${isUnavailable ? 'bg-slate-50/50' : 'cursor-context-menu'}`}><button type="button" disabled={savingKey === key || isUnavailable} onClick={() => toggle(todo.id, date, done)} title={isFuture ? 'This date is not available yet' : isUnscheduled ? 'Not scheduled for this weekday' : entry ? `${entry.newStatus}${done && entry.performedForName ? ` — ${entry.performedForName}` : ''}` : 'Mark completed'} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${done ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-surface text-transparent hover:border-brand-400 hover:bg-brand-50'} disabled:cursor-not-allowed disabled:opacity-35`}><Check className="h-4 w-4" /></button>{done && entry?.performedForName && <p className="mt-1 truncate text-[10px] text-slate-400" title={entry.performedForName}>{entry.performedForName}</p>}{details && <button type="button" onClick={(event) => { event.stopPropagation(); openWorkDetails(todo, workDate); }} className="absolute right-1 top-1 rounded p-0.5 text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" title="View or edit findings and work details" aria-label="View or edit findings and work details"><FileText className="h-3.5 w-3.5" /></button>}</td>;
                })}</tr>;
              })}
              </Fragment>)}
              {!todos.length && <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500">No maintenance to-dos match this view.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-slate-500"><ExternalLink className="h-3.5 w-3.5" /> Right-click an available date cell to record findings, actions, materials, and recommendations.</p>
      </CardContent>
    </Card>
    <Dialog
      open={Boolean(detailsTarget)}
      onClose={() => { if (!savingDetails) setDetailsTarget(null); }}
      title={`Maintenance Details — ${detailsTarget?.todo.title ?? ''}`}
      description={detailsTarget ? `${facilityPath(detailsTarget.todo.facilityId)} · ${format(new Date(`${detailsTarget.workDate}T12:00:00`), 'MMMM d, yyyy')}` : undefined}
      size="lg"
      footer={<><Button variant="outline" disabled={savingDetails || convertingDetails} onClick={() => setDetailsTarget(null)}>Cancel</Button><Button variant="outline" disabled={savingDetails || convertingDetails} onClick={convertDetailsToTask}>{workDetailsByKey.get(`${detailsTarget?.todo.id}|${detailsTarget?.workDate}`)?.convertedTaskId ? 'Open Task' : convertingDetails ? 'Converting…' : 'Convert to Task'}</Button><Button disabled={savingDetails || convertingDetails} onClick={saveDetails}>{savingDetails ? 'Saving…' : 'Save Details'}</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="maintenance-findings">Findings</Label><Textarea id="maintenance-findings" value={detailsForm.findings} onChange={(event) => setDetailsForm((current) => ({ ...current, findings: event.target.value }))} placeholder="Observations, defects, or conditions found" /></div>
        <div><Label htmlFor="maintenance-action">Action Taken</Label><Textarea id="maintenance-action" value={detailsForm.actionTaken} onChange={(event) => setDetailsForm((current) => ({ ...current, actionTaken: event.target.value }))} placeholder="Work completed or corrective action performed" /></div>
        <div><Label htmlFor="maintenance-materials">Materials Used</Label><Textarea id="maintenance-materials" value={detailsForm.materialsUsed} onChange={(event) => setDetailsForm((current) => ({ ...current, materialsUsed: event.target.value }))} placeholder="Materials, parts, and quantities used" /></div>
        <div><Label htmlFor="maintenance-recommendation">Recommendation</Label><Textarea id="maintenance-recommendation" value={detailsForm.recommendation} onChange={(event) => setDetailsForm((current) => ({ ...current, recommendation: event.target.value }))} placeholder="Follow-up work or preventive recommendations" /></div>
      </div>
    </Dialog>
  </div>;
}
