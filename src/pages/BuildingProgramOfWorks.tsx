import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { addDays, addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, isAfter, isBefore, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarRange, GripVertical } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { BfmProjectReportControls } from '@/components/building/BfmProjectReportControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { fetchBfmProjects, updateBfmProject, type BfmOperationsData, type BfmProject } from '@/lib/api';

type ViewMode = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
type Cell = { start: Date; end: Date; top: string; bottom: string };
type DragState = { project: BfmProject; mode: 'move' | 'start' | 'end' };
type DragPreview = { projectId: string; start: Date; end: Date };
const statusColors: Record<string, string> = { Planned: 'bg-slate-500', 'In Progress': 'bg-blue-600', 'On Hold': 'bg-amber-500', Completed: 'bg-green-600', Cancelled: 'bg-red-500' };

function viewCells(mode: ViewMode, anchor: Date): Cell[] {
  if (mode === 'Daily') return eachDayOfInterval({ start: addDays(anchor, -3), end: addDays(anchor, 10) }).map((day) => ({ start: day, end: day, top: format(day, 'EEE'), bottom: format(day, 'MMM d') }));
  if (mode === 'Weekly') return Array.from({ length: 8 }, (_, index) => addWeeks(startOfWeek(anchor, { weekStartsOn: 1 }), index - 2)).map((day) => ({ start: day, end: endOfWeek(day, { weekStartsOn: 1 }), top: `Week ${format(day, 'w')}`, bottom: format(day, 'MMM d') }));
  if (mode === 'Monthly') return eachDayOfInterval({ start: startOfMonth(anchor), end: endOfMonth(anchor) }).map((day) => ({ start: day, end: day, top: format(day, 'EEE'), bottom: format(day, 'd') }));
  if (mode === 'Quarterly') return eachWeekOfInterval({ start: startOfQuarter(anchor), end: endOfQuarter(anchor) }, { weekStartsOn: 1 }).map((day) => ({ start: day, end: endOfWeek(day, { weekStartsOn: 1 }), top: `W${format(day, 'w')}`, bottom: format(day, 'MMM d') }));
  return eachMonthOfInterval({ start: startOfYear(anchor), end: endOfYear(anchor) }).map((day) => ({ start: day, end: endOfMonth(day), top: format(day, 'MMM'), bottom: format(day, 'yyyy') }));
}

export default function BuildingProgramOfWorks() {
  const { token } = useAuth(); const { toast } = useToast();
  const [data, setData] = useState<BfmOperationsData | null>(null); const [anchor, setAnchor] = useState(new Date());
  const [mode, setMode] = useState<ViewMode>('Monthly'); const [drag, setDrag] = useState<DragState | null>(null); const [dragPreview, setDragPreview] = useState<DragPreview | null>(null); const [savingId, setSavingId] = useState('');
  const [notesProject, setNotesProject] = useState<BfmProject | null>(null); const [notesDraft, setNotesDraft] = useState('');
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const reportControls = data ? <BfmProjectReportControls facilities={data.facilities} projects={data.projects} includeDateFilter /> : null;
  useEffect(() => { fetchBfmProjects(token).then(setData).catch((error) => toast({ kind: 'error', title: 'Unable to load Program of Works', description: error instanceof Error ? error.message : 'Please try again.' })); }, [token, toast]);
  const cells = useMemo(() => viewCells(mode, anchor), [mode, anchor]); const rangeStart = cells[0]?.start; const rangeEnd = cells[cells.length - 1]?.end;
  const facilityById = useMemo(() => new Map((data?.facilities ?? []).map((item) => [item.id, item])), [data?.facilities]);
  const facilityPath = (facilityId: string) => { const names: string[] = []; let item = facilityById.get(facilityId); while (item) { names.unshift(item.name); item = item.parentId ? facilityById.get(item.parentId) : undefined; } return names.join(' › '); };
  const rows = useMemo(() => (data?.projects ?? []).map((project) => ({ ...project, path: facilityPath(project.facilityId) })).sort((a, b) => a.path.localeCompare(b.path) || a.targetDate.localeCompare(b.targetDate)), [data?.projects, facilityById]);
  const visibleRows = rows.filter((project) => rangeStart && rangeEnd && !isAfter(parseISO(project.startDate || project.targetDate), rangeEnd) && !isBefore(parseISO(project.targetDate), rangeStart));
  const labelText = mode === 'Daily' ? `${format(cells[0].start, 'MMM d')} – ${format(cells.at(-1)!.end, 'MMM d, yyyy')}` : mode === 'Weekly' ? 'Eight-week plan' : mode === 'Monthly' ? format(anchor, 'MMMM yyyy') : mode === 'Quarterly' ? `Q${Math.floor(anchor.getMonth() / 3) + 1} ${format(anchor, 'yyyy')}` : format(anchor, 'yyyy');
  const label = <span className="flex flex-wrap items-center gap-2"><span>{labelText}</span>{reportControls}</span>;
  const shift = (direction: number) => setAnchor((value) => mode === 'Daily' ? addDays(value, direction * 7) : mode === 'Weekly' ? addWeeks(value, direction * 4) : mode === 'Monthly' ? addMonths(value, direction) : mode === 'Quarterly' ? addQuarters(value, direction) : addYears(value, direction));
  const cellIndex = (date: Date, end = false) => { const found = cells.findIndex((cell) => date >= cell.start && date <= cell.end); return found >= 0 ? found : end ? cells.length - 1 : 0; };
  function autoScrollTimeline(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const timeline = timelineRef.current;
    if (!timeline || !drag) return;
    const bounds = timeline.getBoundingClientRect();
    const edge = 90;
    if (event.clientX > bounds.right - edge) timeline.scrollLeft += 24;
    else if (event.clientX < bounds.left + edge) timeline.scrollLeft -= 24;
  }
  function scrollNearEdge(clientX: number) {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const bounds = timeline.getBoundingClientRect();
    if (clientX > bounds.right - 90) timeline.scrollLeft += 28;
    else if (clientX < bounds.left + 90) timeline.scrollLeft -= 28;
  }
  function cellAtPointer(clientX: number) {
    const timeline = timelineRef.current;
    if (!timeline || !cells.length) return null;
    const bounds = timeline.getBoundingClientRect();
    const fixedColumnWidth = 310;
    const plotWidth = Math.max(1, timeline.scrollWidth - fixedColumnWidth);
    const position = clientX - bounds.left + timeline.scrollLeft - fixedColumnWidth;
    const index = Math.max(0, Math.min(cells.length - 1, Math.floor(position / (plotWidth / cells.length))));
    return cells[index];
  }
  function scheduleForCell(activeDrag: DragState, cell: Cell) {
    const oldStart = parseISO(activeDrag.project.startDate || activeDrag.project.targetDate); const oldEnd = parseISO(activeDrag.project.targetDate); let start = oldStart; let end = oldEnd;
    if (activeDrag.mode === 'move') { const length = differenceInCalendarDays(oldEnd, oldStart); start = cell.start; end = addDays(start, length); }
    if (activeDrag.mode === 'start') start = cell.start > end ? end : cell.start; if (activeDrag.mode === 'end') end = cell.end < start ? start : cell.end;
    return { start, end };
  }
  async function applyScheduleDrop(activeDrag: DragState, cell: Cell) {
    const { start, end } = scheduleForCell(activeDrag, cell);
    setDrag(null); setDragPreview(null); setSavingId(activeDrag.project.id);
    try { setData(await updateBfmProject(token, activeDrag.project.id, { title: activeDrag.project.title, description: activeDrag.project.description, category: activeDrag.project.category, priority: activeDrag.project.priority, status: activeDrag.project.status, startDate: format(start, 'yyyy-MM-dd'), targetDate: format(end, 'yyyy-MM-dd'), workerIds: activeDrag.project.workerIds })); toast({ kind: 'success', title: 'Schedule updated', description: `${activeDrag.project.title} was rescheduled in Oracle.` }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to update schedule', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSavingId(''); }
  }
  function dropOn(cell: Cell) { if (drag) void applyScheduleDrop(drag, cell); }
  function beginPointerDrag(event: ReactPointerEvent, project: BfmProject, dragMode: DragState['mode']) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const activeDrag: DragState = { project, mode: dragMode };
    setDrag(activeDrag);
    setDragPreview({ projectId: project.id, start: parseISO(project.startDate || project.targetDate), end: parseISO(project.targetDate) });
    const move = (pointerEvent: PointerEvent) => {
      scrollNearEdge(pointerEvent.clientX);
      const cell = cellAtPointer(pointerEvent.clientX);
      if (cell) setDragPreview({ projectId: project.id, ...scheduleForCell(activeDrag, cell) });
    };
    const up = (pointerEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      const cell = cellAtPointer(pointerEvent.clientX);
      if (cell) void applyScheduleDrop(activeDrag, cell); else { setDrag(null); setDragPreview(null); }
    };
    const cancel = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); setDrag(null); setDragPreview(null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  }
  async function saveProjectNotes() {
    if (!notesProject) return;
    setSavingId(notesProject.id);
    try {
      setData(await updateBfmProject(token, notesProject.id, { title: notesProject.title, description: notesDraft, category: notesProject.category, priority: notesProject.priority, status: notesProject.status, startDate: notesProject.startDate || notesProject.targetDate, targetDate: notesProject.targetDate, budgetAmount: notesProject.budgetAmount, budgetStatus: notesProject.budgetStatus, workerIds: notesProject.workerIds }));
      setNotesProject(null); toast({ kind: 'success', title: 'Project notes updated', description: `${notesProject.title} notes were saved.` });
    } catch (error) { toast({ kind: 'error', title: 'Unable to update notes', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSavingId(''); }
  }
  if (!data) return <p className="p-8 text-center text-sm text-slate-500">Loading Oracle projects…</p>;
  return <div><PageHeader title="Building and Facilities Program of Works" description="Drag project bars to move schedules. Drag either edge to widen or shorten the date range." crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'Building and Facilities Management' }, { label: 'Program of Works' }]} /><Card><CardHeader className="flex flex-row items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5 text-brand-600" />Program of Works</CardTitle><p className="mt-1 text-sm text-slate-500">Interactive tentative schedules grouped by facility.</p></div><div className="flex flex-wrap gap-2"><Select className="w-32" value={mode} onChange={(event) => setMode(event.target.value as ViewMode)}>{['Daily','Weekly','Monthly','Quarterly','Yearly'].map((value) => <option key={value}>{value}</option>)}</Select><Button variant="outline" size="icon" onClick={() => shift(-1)}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setAnchor(new Date())}>Today</Button><Button variant="outline" size="icon" onClick={() => shift(1)}><ArrowRight className="h-4 w-4" /></Button></div></CardHeader><CardContent><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{label}</h2><div className="flex flex-wrap gap-2">{Object.entries(statusColors).map(([status, color]) => <span key={status} className="flex items-center gap-1 text-xs text-slate-500"><span className={`h-2.5 w-2.5 rounded-full ${color}`} />{status}</span>)}</div></div><div ref={timelineRef} onDragOver={autoScrollTimeline} className="overflow-x-auto scroll-smooth rounded-lg border border-slate-200"><div className={mode === 'Yearly' ? 'min-w-[1450px]' : 'min-w-[1180px]'}><div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `310px repeat(${cells.length}, minmax(38px, 1fr))` }}><div className="border-r border-slate-200 p-3 text-sm font-semibold">Facility / Project</div>{cells.map((cell) => <div key={cell.start.toISOString()} className="border-r border-slate-200 py-2 text-center text-[10px]"><span className="block font-medium">{cell.top}</span><span className="text-xs font-semibold">{cell.bottom}</span></div>)}</div>{visibleRows.length ? visibleRows.map((project) => { const originalStartIndex = cellIndex(parseISO(project.startDate || project.targetDate)); const originalEndIndex = cellIndex(parseISO(project.targetDate), true); const activePreview = dragPreview?.projectId === project.id ? dragPreview : null; const startIndex = activePreview ? cellIndex(activePreview.start) : originalStartIndex; const endIndex = activePreview ? cellIndex(activePreview.end, true) : originalEndIndex; return <div key={project.id} className="grid min-h-20 border-b border-slate-200 last:border-b-0" style={{ gridTemplateColumns: `310px repeat(${cells.length}, minmax(38px, 1fr))` }}><div className="border-r border-slate-200 p-3"><p className="font-medium">{project.title}</p><p className="mt-0.5 text-xs text-slate-500">{project.path}</p><span className="mt-1 flex flex-wrap gap-1"><Badge>{project.status}</Badge><Badge>{project.budgetStatus}</Badge></span>{project.budgetAmount != null && <p className="mt-1 text-xs font-medium text-slate-600">{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(project.budgetAmount)}</p>}</div><div className="relative grid items-center" style={{ gridColumn: `2 / span ${cells.length}`, gridTemplateColumns: `repeat(${cells.length}, minmax(38px, 1fr))` }}>{cells.map((cell) => <div key={cell.start.toISOString()} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(cell)} className={`relative h-full border-r border-slate-100 ${drag ? 'z-20 bg-transparent' : 'z-0'}`} />)}{activePreview && <div className={`pointer-events-none z-[5] flex h-9 items-center rounded-md border border-dashed border-white/70 text-xs font-medium text-white opacity-30 ${statusColors[project.status] ?? 'bg-brand-600'}`} style={{ gridColumn: `${originalStartIndex + 1} / span ${Math.max(1, originalEndIndex - originalStartIndex + 1)}`, gridRow: 1 }}><span className="truncate px-3">{project.description?.trim() || 'No notes'} · original</span></div>}<div onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setNotesProject(project); setNotesDraft(project.description ?? ''); }} onPointerDown={(event) => beginPointerDrag(event, project, 'move')} className={`z-10 flex h-9 touch-none select-none cursor-grab items-center rounded-md text-xs font-medium text-white shadow-sm transition-[box-shadow,opacity] ${activePreview ? 'ring-2 ring-brand-300 shadow-xl opacity-90' : ''} active:cursor-grabbing ${statusColors[project.status] ?? 'bg-brand-600'} ${savingId === project.id ? 'opacity-50' : ''}`} style={{ gridColumn: `${startIndex + 1} / span ${Math.max(1, endIndex - startIndex + 1)}`, gridRow: 1 }} title="Left-drag to adjust schedule · Right-click to edit notes"><span onPointerDown={(event) => beginPointerDrag(event, project, 'start')} className="flex h-full w-8 cursor-ew-resize items-center justify-center rounded-l-md bg-black/20" title="Drag to change start date"><GripVertical className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate px-2">{project.description?.trim() || 'No notes'}</span><span onPointerDown={(event) => beginPointerDrag(event, project, 'end')} className="flex h-full w-8 cursor-ew-resize items-center justify-center rounded-r-md bg-black/20" title="Drag to change end date"><GripVertical className="h-4 w-4" /></span></div></div></div>; }) : <div className="p-10 text-center text-sm text-slate-500">No projects scheduled in this period.</div>}</div></div><p className="mt-3 text-xs text-slate-500">Left-drag the middle of a project bar to move it while preserving duration. Left-drag either handle to adjust its start or end. Right-click a bar to edit its notes.</p></CardContent></Card><Dialog open={Boolean(notesProject)} onClose={() => setNotesProject(null)} title={notesProject ? `Project Notes — ${notesProject.title}` : 'Project Notes'} description="Update the notes displayed for this project on the Program of Works." size="md" footer={<><Button variant="outline" onClick={() => setNotesProject(null)}>Cancel</Button><Button disabled={savingId === notesProject?.id} onClick={() => void saveProjectNotes()}>{savingId === notesProject?.id ? 'Saving…' : 'Save Notes'}</Button></>}><div><Label>Notes</Label><Textarea className="mt-1 min-h-40" value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Enter project notes, instructions, or chart details." /></div></Dialog></div>;
}
