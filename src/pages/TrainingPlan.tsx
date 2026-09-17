import { useEffect, useMemo, useState } from 'react';
import { addDays, addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, isAfter, isBefore, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { fetchTrainingSeminars, saveTrainingSeminar, type TrainingSeminar } from '@/lib/api';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
type ViewMode = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
type Cell = { start: Date; end: Date; top: string; bottom: string };
function viewCells(mode: ViewMode, anchor: Date): Cell[] {
  if (mode === 'Daily') return eachDayOfInterval({ start: addDays(anchor, -3), end: addDays(anchor, 10) }).map((day) => ({ start: day, end: day, top: format(day, 'EEE'), bottom: format(day, 'MMM d') }));
  if (mode === 'Weekly') return Array.from({ length: 8 }, (_, index) => addWeeks(startOfWeek(anchor, { weekStartsOn: 1 }), index - 2)).map((day) => ({ start: day, end: endOfWeek(day, { weekStartsOn: 1 }), top: `Week ${format(day, 'w')}`, bottom: format(day, 'MMM d') }));
  if (mode === 'Monthly') return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) }).map((day) => ({ start: day, end: day, top: format(day, 'EEE'), bottom: format(day, 'd') }));
  if (mode === 'Quarterly') return eachWeekOfInterval({ start: startOfQuarter(anchor), end: endOfQuarter(anchor) }, { weekStartsOn: 1 }).map((day) => ({ start: day, end: endOfWeek(day, { weekStartsOn: 1 }), top: `W${format(day, 'w')}`, bottom: format(day, 'MMM d') }));
  return eachMonthOfInterval({ start: startOfYear(anchor), end: endOfYear(anchor) }).map((day) => ({ start: day, end: endOfMonth(day), top: format(day, 'MMM'), bottom: format(day, 'yyyy') }));
}

const money = (value: number | null) => value == null ? '—' : value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const color = (status: string | null) => status === 'Implemented' ? 'bg-green-600' : status === 'Scheduled' ? 'bg-blue-600' : 'bg-slate-500';

export default function TrainingPlan() {
  const { token } = useAuth();
  const [params] = useSearchParams();
  const [programs, setPrograms] = useState<TrainingSeminar[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [anchor, setAnchor] = useState(() => /^\d{4}$/.test(params.get('year') ?? '') ? parseISO(`${params.get('year')}-01-01`) : new Date());
  const [mode, setMode] = useState<ViewMode>('Yearly');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<{ row: TrainingSeminar; edge: 'move' | 'start' | 'end' } | null>(null);
  const [editing, setEditing] = useState<TrainingSeminar | null>(null);
  const [dates, setDates] = useState({ start: '', end: '' });
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setError('Sign in to view the training plan.'); setLoading(false); return; }
    fetchTrainingSeminars(token).then((result) => { if (!cancelled) { setPrograms(result.programs); setCanEdit(result.canEdit); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load training plan.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  const cells = useMemo(() => viewCells(mode, anchor), [mode, anchor]);
  const first = cells[0].start;
  const last = cells[cells.length - 1].end;
  const filtered = programs.filter((row) => row.name.toLowerCase().includes(query.toLowerCase()) && (!status || row.status === status));
  const rows = filtered.filter((row) => row.dateFrom && !isAfter(parseISO(row.dateFrom), last) && !isBefore(parseISO(row.dateTo || row.dateFrom), first))
    .sort((a, b) => a.dateFrom!.localeCompare(b.dateFrom!) || a.name.localeCompare(b.name));
  const undated = filtered.filter((row) => !row.dateFrom);
  const years = [...new Set([String(anchor.getFullYear()), ...programs.flatMap((row) => row.dateFrom ? [row.dateFrom.slice(0, 4)] : [])])].sort().reverse();
  const index = (date: string) => Math.max(0, Math.min(cells.length - 1, cells.findIndex((cell) => parseISO(date) <= cell.end) < 0 ? cells.length - 1 : cells.findIndex((cell) => parseISO(date) <= cell.end)));
  function shift(direction: number) { setAnchor((value) => mode === 'Daily' ? addDays(value, direction * 7) : mode === 'Weekly' ? addWeeks(value, direction * 4) : mode === 'Monthly' ? addMonths(value, direction) : mode === 'Quarterly' ? addQuarters(value, direction) : addYears(value, direction)); }
  function edit(row: TrainingSeminar) { setEditing(row); setDates({ start: row.dateFrom ?? '', end: row.dateTo ?? row.dateFrom ?? '' }); setError(''); }
  async function save(row: TrainingSeminar, start: string, end: string) {
    if (!token || !canEdit || saving) return;
    if (!start || !end || end < start) { setError('Enter a start date and an end date on or after it.'); return; }
    setSaving(true); setError('');
    try {
      const { id, participantCount: _count, ...values } = row;
      const updated = await saveTrainingSeminar(token, { ...values, dateFrom: start, dateTo: end }, id);
      setPrograms((current) => current.map((item) => item.id === id ? updated : item));
      setEditing(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update schedule.'); }
    finally { setSaving(false); }
  }
  function drop(cell: Cell) {
    if (!drag || saving) return;
    const { row, edge } = drag;
    setDrag(null);
    let start = parseISO(row.dateFrom!); let end = parseISO(row.dateTo || row.dateFrom!);
    if (edge === 'move') { const days = differenceInCalendarDays(end, start); start = cell.start; end = addDays(start, days); }
    if (edge === 'start') start = cell.start > end ? end : cell.start;
    if (edge === 'end') end = cell.end < start ? start : cell.end;
    void save(row, format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd'));
  }
  return <div>
    <PageHeader title="Training Plan" description="Training schedules, budget costs, and actual costs incurred." crumbs={[{ label: 'Learning and Development', to: '/workspace/learning-development' }, { label: 'Training Plan' }]} />
    <Card><CardHeader><CardTitle>Training Plan</CardTitle><div className="mt-3 flex flex-wrap items-center gap-2">
      <Input aria-label="Search training plan" placeholder="Search trainings…" className="w-60" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Select aria-label="Timeline scale" className="w-32" value={mode} onChange={(event) => setMode(event.target.value as ViewMode)}>{['Daily','Weekly','Monthly','Quarterly','Yearly'].map((value) => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Plan year" className="w-28" value={anchor.getFullYear()} onChange={(event) => setAnchor(new Date(Number(event.target.value), anchor.getMonth(), 1))}>{years.map((value) => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Training status" className="w-40" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Scheduled</option><option>Implemented</option></Select>
      <Button variant="outline" aria-label="Previous period" onClick={() => shift(-1)}>←</Button><Button variant="outline" onClick={() => setAnchor(new Date())}>Today</Button><Button variant="outline" aria-label="Next period" onClick={() => shift(1)}>→</Button><Button variant="outline" onClick={() => window.print()}>Print</Button>
    </div></CardHeader><CardContent>
      {loading ? <p role="status">Loading training plan…</p> : <>
        {error && <div role="alert" className="mb-3 text-red-600">{error}{!programs.length && <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div>}
        <p className="mb-3 text-sm">{format(first, 'MMM d, yyyy')} – {format(last, 'MMM d, yyyy')} · {rows.length} sessions</p>
        <p className="mb-3 text-sm">Budget Cost: {money(rows.reduce((sum, row) => sum + (row.budgetCost ?? 0), 0))} · Actual Cost Incurred: {money(rows.reduce((sum, row) => sum + (row.programCost ?? 0), 0))}</p>
        <div className="mb-3 flex gap-4 text-xs"><span className="text-blue-600">● Scheduled</span><span className="text-green-600">● Implemented</span><span className="text-slate-500">● Unspecified</span></div>
        <div className="overflow-x-auto rounded-lg border border-slate-200"><div className="min-w-[1180px]">
          <div className="grid bg-slate-50" style={{ gridTemplateColumns: `310px repeat(${cells.length}, minmax(28px, 1fr))` }}><div className="p-3 text-sm font-semibold">Training / Seminar</div>{cells.map((cell) => <div key={cell.start.toISOString()} className="border-l border-slate-200 py-2 text-center text-xs">{cell.top}<br />{cell.bottom}</div>)}</div>
          {rows.map((row) => <div key={row.id} className="grid border-t border-slate-200" style={{ gridTemplateColumns: '310px 1fr' }}><div className="border-r border-slate-200 p-3"><p className="text-sm font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.dateFrom} – {row.dateTo || row.dateFrom}</p><p className="text-xs text-slate-500">Budget: {money(row.budgetCost)} · Actual: {money(row.programCost)}</p>{canEdit && <Button size="sm" variant="ghost" disabled={saving} onClick={() => edit(row)}>Edit dates</Button>}</div>
            <div className="relative grid items-center" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(28px, 1fr))` }}>
              {cells.map((cell, i) => <div key={i} style={{ gridColumn: i + 1, gridRow: 1 }} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(cell)} className={`h-full border-r border-slate-100 ${drag ? 'z-20' : ''}`} />)}
              <div draggable={canEdit && !saving} onDragStart={(event) => { event.dataTransfer.setData('text/plain', row.id); setDrag({ row, edge: 'move' }); }} onDragEnd={() => setDrag(null)} title={`${row.name}: ${row.dateFrom} to ${row.dateTo || row.dateFrom}`} className={`z-10 flex h-8 items-center rounded text-xs text-white ${color(row.status)} ${canEdit ? 'cursor-grab' : ''}`} style={{ gridColumn: `${index(row.dateFrom!) + 1} / span ${index(row.dateTo || row.dateFrom!) - index(row.dateFrom!) + 1}`, gridRow: 1 }}>
                {canEdit && <span draggable={!saving} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', row.id); setDrag({ row, edge: 'start' }); }} title="Drag start date" className="h-full w-3 shrink-0 cursor-ew-resize bg-black/20" />}
                <span className="min-w-0 flex-1 truncate px-1">{row.status || 'Unspecified'}</span>
                {canEdit && <span draggable={!saving} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('text/plain', row.id); setDrag({ row, edge: 'end' }); }} title="Drag end date" className="h-full w-3 shrink-0 cursor-ew-resize bg-black/20" />}
              </div>
            </div></div>)}
          {!rows.length && <p className="p-8 text-sm text-slate-500">No trainings scheduled in this period.</p>}
        </div></div>
        <p className="mt-3 text-xs text-slate-500">{canEdit ? 'Drag a bar to move its schedule or either edge to resize it. Use Edit dates for precise dates. ' : ''}Trainings without an end date display as one day. Totals cover visible sessions; blank costs are excluded.</p>
        {undated.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm">Without a start date ({undated.length})</summary>{undated.map((row) => <div key={row.id} className="flex items-center justify-between border-b py-2 text-sm"><span>{row.name}</span>{canEdit && <Button size="sm" variant="outline" disabled={saving} onClick={() => edit(row)}>Set dates</Button>}</div>)}</details>}
      </>}
    </CardContent></Card>
    {editing && <Dialog open title="Training Schedule" description={editing.name} onClose={() => { if (!saving) setEditing(null); }} footer={<><Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} onClick={() => void save(editing, dates.start, dates.end)}>Save Dates</Button></>}><div className="space-y-3">{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<Label htmlFor="plan-start">Start Date</Label><Input id="plan-start" type="date" disabled={saving} value={dates.start} onChange={(event) => setDates({ ...dates, start: event.target.value })} /><Label htmlFor="plan-end">End Date</Label><Input id="plan-end" type="date" min={dates.start} disabled={saving} value={dates.end} onChange={(event) => setDates({ ...dates, end: event.target.value })} /></div></Dialog>}
  </div>;
}

