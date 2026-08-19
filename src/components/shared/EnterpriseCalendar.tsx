import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, format, addDays, subDays, isToday, parseISO,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, MapPin, Video, Users, Pencil, Trash2, Plus, AlertTriangle, Paperclip, Bell, X, ThumbsUp, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarLayer, DepartmentId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canApprove } from '@/lib/permissions';
import { fetchUserDirectory, type DirectoryUser } from '@/lib/api';
import { loadState, saveState } from '@/lib/storage';

const ALL_LAYERS: CalendarLayer[] = ['Enterprise-wide', 'Management', 'Department', 'Training', 'Compliance', 'Projects', 'Maintenance', 'Personal'];
const UNASSIGNED_DEPARTMENT = '__UNASSIGNED__';
type CalendarView = 'month' | 'week' | 'agenda';

function directoryDisplayName(person: DirectoryUser) {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.name;
}

interface CalendarUserSettings {
  view?: CalendarView;
  cursorDate?: string;
  activeLayers?: CalendarLayer[];
  activeDepartmentIds?: string[] | null;
}

function calendarSettingsKey(username: string) {
  return `calendar-settings:${username || 'anonymous'}`;
}

function loadCalendarSettings(username: string): CalendarUserSettings {
  return loadState<CalendarUserSettings>(calendarSettingsKey(username), () => ({}));
}

function safeCalendarView(view: unknown): CalendarView {
  return view === 'week' || view === 'agenda' ? view : 'month';
}

function safeCalendarCursor(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function safeCalendarLayers(value: unknown) {
  if (!Array.isArray(value)) return new Set<CalendarLayer>(ALL_LAYERS);
  return new Set(value.filter((item): item is CalendarLayer => ALL_LAYERS.includes(item as CalendarLayer)));
}

function safeDepartmentIds(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  return new Set(value.map((item) => String(item)));
}

function eventDepartmentIds(event: Partial<CalendarEvent>) {
  return event.departmentIds?.length ? event.departmentIds : event.departmentId ? [event.departmentId] : [];
}

function EventDot({ color }: { color: string }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function EventForm({ initial, onSave, onCancel, onDelete, existingEvents }: { initial?: Partial<CalendarEvent>; onSave: (v: { title: string; layer: CalendarLayer; date: string; startTime: string; endTime: string; location: string; description: string; departmentIds: string[]; visibility: CalendarEvent['visibility']; visibleToUsernames: string[]; attachments: NonNullable<CalendarEvent['attachments']> }) => void; onCancel: () => void; onDelete?: () => void; existingEvents: CalendarEvent[] }) {
  const { departments } = useData();
  const { token } = useAuth();
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [layer, setLayer] = useState<CalendarLayer>(initial?.layer ?? 'Personal');
  const [date, setDate] = useState(initial?.start ? initial.start.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(initial?.start ? initial.start.slice(11, 16) : '09:00');
  const [endTime, setEndTime] = useState(initial?.end ? initial.end.slice(11, 16) : '10:00');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [departmentIds, setDepartmentIds] = useState<string[]>(eventDepartmentIds(initial ?? {}));
  const [visibility, setVisibility] = useState<CalendarEvent['visibility']>(initial?.visibility ?? 'All employees');
  const [visibleToUsernames, setVisibleToUsernames] = useState<string[]>(initial?.visibleToUsernames ?? []);
  const [attachments, setAttachments] = useState<NonNullable<CalendarEvent['attachments']>>(initial?.attachments ?? []);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchUserDirectory(token)
      .then((users) => {
        if (!cancelled) setDirectoryUsers(users);
      })
      .catch((loadError) => {
        console.warn('Unable to load Oracle user directory for event visibility.', loadError);
      });
    return () => { cancelled = true; };
  }, [token]);

  const conflicts = useMemo(() => {
    if (!date || !startTime || !endTime || endTime <= startTime) return [];
    const s = new Date(`${date}T${startTime}`);
    const e = new Date(`${date}T${endTime}`);
    return existingEvents.filter((ev) => {
      if (initial?.id && ev.id === initial.id) return false;
      if (!isSameDay(parseISO(ev.start), s)) return false;
      const evS = parseISO(ev.start);
      const evE = parseISO(ev.end);
      return s < evE && e > evS;
    });
  }, [date, startTime, endTime, existingEvents, initial?.id]);

  function submit() {
    if (!title.trim() || !date || !startTime || !endTime) {
      setError('Please complete all required fields.');
      return;
    }
    if (endTime <= startTime) {
      setError('End time must be after the start time.');
      return;
    }
    if (visibility === 'Department only' && departmentIds.length === 0) {
      setError('Select at least one department for department-only visibility.');
      return;
    }
    if (visibility === 'Specific people' && visibleToUsernames.length === 0) {
      setError('Select at least one person who can see this event.');
      return;
    }
    onSave({ title: title.trim(), layer, date, startTime, endTime, location, description, departmentIds, visibility, visibleToUsernames, attachments });
  }

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => ({ name: file.name, size: file.size, type: file.type || undefined }));
    setAttachments((current) => {
      const merged = [...current, ...next];
      const unique = new Map(merged.map((file) => [`${file.name}:${file.size}`, file]));
      return [...unique.values()].slice(0, 20);
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  function togglePerson(username: string) {
    setVisibleToUsernames((current) => current.includes(username) ? current.filter((item) => item !== username) : [...current, username]);
  }

  function toggleDepartment(departmentId: string) {
    setDepartmentIds((current) => current.includes(departmentId) ? current.filter((item) => item !== departmentId) : [...current, departmentId]);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="ev-title" required>Event Title</Label>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. One-on-one with GM" />
      </div>
      <div>
        <Label htmlFor="ev-layer" required>Category</Label>
        <Select id="ev-layer" value={layer} onChange={(e) => setLayer(e.target.value as CalendarLayer)}>
          {ALL_LAYERS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <Label htmlFor="ev-date" required>Date</Label>
          <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ev-start" required>Start Time</Label>
          <Input id="ev-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ev-end" required>End Time</Label>
          <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="ev-location">Location or Meeting Link</Label>
        <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Boardroom or meeting URL" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Departments</Label>
          <div id="ev-dept" className="max-h-28 overflow-y-auto rounded-md border border-slate-200 bg-surface p-2">
            <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
              <input
                type="checkbox"
                checked={departmentIds.length === 0}
                onChange={() => setDepartmentIds([])}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="font-medium text-slate-700">No department / enterprise-wide</span>
            </label>
            {departments.map((department) => (
              <label key={department.id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={departmentIds.includes(department.id)}
                  onChange={() => toggleDepartment(department.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="font-medium text-slate-700">{department.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="ev-visibility" required>Who can see this post</Label>
          <Select id="ev-visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as CalendarEvent['visibility'])}>
            <option>All employees</option>
            <option>Department only</option>
            <option>Specific people</option>
          </Select>
        </div>
      </div>
      {visibility === 'Specific people' && (
        <div>
          <Label>Specific people</Label>
          <div className="max-h-36 overflow-y-auto rounded-md border border-slate-200 bg-surface p-2">
            <div className="grid gap-1 sm:grid-cols-2">
              {directoryUsers.map((employee) => {
                const username = employee.username.toLowerCase();
                return (
                  <label key={employee.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
                    <input type="checkbox" checked={visibleToUsernames.includes(username)} onChange={() => togglePerson(username)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
                    <span><span className="font-medium text-slate-700">{employee.name}</span><span className="block text-slate-400">{employee.departmentCode ?? 'No department'} · {username}</span></span>
                  </label>
                );
              })}
              {directoryUsers.length === 0 && <p className="px-2 py-1.5 text-xs text-slate-400">Loading Oracle users…</p>}
            </div>
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="ev-desc">Description</Label>
        <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
      </div>
      <div>
        <Label htmlFor="ev-files">Attachments</Label>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn('rounded-lg border border-dashed p-4 text-center transition-colors', dragging ? 'border-brand-400 bg-brand-50/40' : 'border-slate-300 bg-slate-50/50')}
        >
          <Paperclip className="mx-auto h-5 w-5 text-slate-400" />
          <p className="mt-1 text-sm font-medium text-slate-700">Drag and drop files here</p>
          <p className="text-xs text-slate-400">or choose files to attach to this event post</p>
          <Input id="ev-files" type="file" multiple className="mt-3" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ''; }} />
        </div>
        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((file) => (
              <div key={`${file.name}:${file.size}`} className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 truncate text-slate-600">{file.name} <span className="text-slate-400">({formatBytes(file.size)})</span></span>
                <button type="button" onClick={() => setAttachments((current) => current.filter((item) => !(item.name === file.name && item.size === file.size)))} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${file.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {conflicts.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-gold-200 bg-gold-50 p-2.5 text-xs text-gold-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Possible conflict with: {conflicts.map((c) => c.title).join(', ')}</span>
        </div>
      )}
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
      <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {onDelete && <Button variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete</Button>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={submit}>Save Event</Button>
        </div>
      </div>
    </div>
  );
}

type CalendarSize = 'compact' | 'default' | 'large';

export function EnterpriseCalendar({ size = 'default', autoOpenNew = false }: { size?: CalendarSize; autoOpenNew?: boolean }) {
  const compact = size === 'compact';
  const large = size === 'large';
  const { events, departments, addPersonalEvent, updatePersonalEvent, deletePersonalEvent, toggleEventDone, createTaskFromCalendarEvent } = useData();
  const { username, token } = useAuth();
  const { effectiveRole } = useRolePreview();
  const { toast } = useToast();
  const [view, setView] = useState<CalendarView>(() => safeCalendarView(loadCalendarSettings(username).view));
  const [cursor, setCursor] = useState(() => safeCalendarCursor(loadCalendarSettings(username).cursorDate));
  const [activeLayers, setActiveLayers] = useState<Set<CalendarLayer>>(() => safeCalendarLayers(loadCalendarSettings(username).activeLayers));
  const [activeDepartmentIds, setActiveDepartmentIds] = useState<Set<string> | null>(() => safeDepartmentIds(loadCalendarSettings(username).activeDepartmentIds));
  const [settingsOwner, setSettingsOwner] = useState(username);
  const [departmentMenuOpen, setDepartmentMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(autoOpenNew);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState<Date | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [taskSource, setTaskSource] = useState<CalendarEvent | null>(null);
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskPriority, setTaskPriority] = useState<'Low' | 'Normal' | 'High' | 'Urgent'>('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDirectoryUsers, setTaskDirectoryUsers] = useState<DirectoryUser[]>([]);

  useEffect(() => {
    const settings = loadCalendarSettings(username);
    setView(safeCalendarView(settings.view));
    setCursor(safeCalendarCursor(settings.cursorDate));
    setActiveLayers(safeCalendarLayers(settings.activeLayers));
    setActiveDepartmentIds(safeDepartmentIds(settings.activeDepartmentIds));
    setDepartmentMenuOpen(false);
    setSettingsOwner(username);
  }, [username]);

  useEffect(() => {
    if (settingsOwner !== username) return;
    saveState<CalendarUserSettings>(calendarSettingsKey(username), {
      view,
      cursorDate: format(cursor, 'yyyy-MM-dd'),
      activeLayers: [...activeLayers],
      activeDepartmentIds: activeDepartmentIds ? [...activeDepartmentIds] : null,
    });
  }, [activeDepartmentIds, activeLayers, cursor, settingsOwner, username, view]);

  useEffect(() => {
    if (!taskSource) return;
    let cancelled = false;
    fetchUserDirectory(token)
      .then((users) => {
        if (!cancelled) setTaskDirectoryUsers(users);
      })
      .catch((error) => {
        console.warn('Unable to load Oracle users for task assignment.', error);
      });
    return () => { cancelled = true; };
  }, [taskSource, token]);

  const departmentFilterOptions = useMemo(() => [
    { id: UNASSIGNED_DEPARTMENT, name: 'No department / enterprise-wide' },
    ...departments.map((department) => ({ id: department.id, name: department.name })),
  ], [departments]);

  const activeDepartmentCount = activeDepartmentIds ? activeDepartmentIds.size : departmentFilterOptions.length;
  const departmentFilterLabel = activeDepartmentIds === null
    ? 'All departments'
    : activeDepartmentCount === 0
      ? 'No departments'
      : `${activeDepartmentCount} department${activeDepartmentCount === 1 ? '' : 's'}`;
  const departmentNameById = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);

  const visibleEvents = useMemo(() => events.filter((e) => {
    if (!activeLayers.has(e.layer)) return false;
    if (!activeDepartmentIds) return true;
    const ids = eventDepartmentIds(e);
    if (ids.length === 0) return activeDepartmentIds.has(UNASSIGNED_DEPARTMENT);
    return ids.some((id) => activeDepartmentIds.has(id));
  }), [events, activeLayers, activeDepartmentIds]);

  function toggleLayer(l: CalendarLayer) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
  }

  function toggleDepartmentFilter(id: string) {
    setActiveDepartmentIds((current) => {
      const next = new Set(current ?? departmentFilterOptions.map((option) => option.id));
      if (next.has(id)) next.delete(id); else next.add(id);
      return next.size === departmentFilterOptions.length ? null : next;
    });
  }

  function selectAllDepartments() {
    setActiveDepartmentIds(null);
  }

  function clearDepartmentFilters() {
    setActiveDepartmentIds(new Set());
  }

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) }), [cursor]);

  function eventsOnDay(day: Date) {
    return visibleEvents.filter((e) => isSameDay(parseISO(e.start), day)).sort((a, b) => a.start.localeCompare(b.start));
  }

  function goPrev() {
    setCursor((c) => (view === 'month' ? subMonths(c, 1) : subDays(c, 7)));
  }
  function goNext() {
    setCursor((c) => (view === 'month' ? addMonths(c, 1) : addDays(c, 7)));
  }
  function goToday() {
    setCursor(new Date());
    setSelectedDate(new Date());
  }

  const agendaEvents = useMemo(() => visibleEvents.filter((e) => new Date(e.start) >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a.start.localeCompare(b.start)).slice(0, compact ? 6 : 40), [visibleEvents, compact]);

  function handleSaveEvent(v: { title: string; layer: CalendarLayer; date: string; startTime: string; endTime: string; location: string; description: string; departmentIds: string[]; visibility: CalendarEvent['visibility']; visibleToUsernames: string[]; attachments: NonNullable<CalendarEvent['attachments']> }) {
    const start = `${v.date}T${v.startTime}:00`;
    const end = `${v.date}T${v.endTime}:00`;
    const departmentIds = v.departmentIds as DepartmentId[];
    const departmentId = departmentIds[0] as DepartmentId | undefined;
    if (editingEvent) {
      updatePersonalEvent(editingEvent.id, { title: v.title, layer: v.layer, start, end, location: v.location, description: v.description, departmentIds, departmentId, visibility: v.visibility, visibleToUsernames: v.visibleToUsernames, attachments: v.attachments });
      toast({ kind: 'success', title: 'Event updated' });
    } else {
      addPersonalEvent({ title: v.title, start, end, location: v.location, description: v.description, departmentIds, departmentId, visibility: v.visibility, visibleToUsernames: v.visibleToUsernames, attachments: v.attachments, layer: v.layer });
      toast({ kind: 'success', title: 'Personal event created' });
    }
    setFormOpen(false);
    setEditingEvent(null);
    setNewEventDate(null);
  }

  function openNewEventForDate(day: Date) {
    setSelectedDate(day);
    setEditingEvent(null);
    setNewEventDate(day);
    setFormOpen(true);
  }

  function openTaskDialog(event: CalendarEvent) {
    setTaskSource(event);
    setTaskAssignee('');
    setTaskPriority(event.layer === 'Compliance' ? 'High' : 'Normal');
    setTaskDueDate(event.start.slice(0, 10));
    setTaskDescription(event.description ?? `Task converted from calendar event: ${event.title}`);
  }

  async function handleCreateTask() {
    if (!taskSource || !taskAssignee) {
      toast({ kind: 'error', title: 'Assignee required', description: 'Select the employee who should receive this task.' });
      return;
    }
    const departmentIds = eventDepartmentIds(taskSource);
    const result = await createTaskFromCalendarEvent({
      calendarEventId: taskSource.id,
      title: taskSource.title,
      description: taskDescription,
      assigneeUsername: taskAssignee,
      departmentId: departmentIds[0],
      priority: taskPriority,
      dueDate: taskDueDate,
    });
    if (!result.ok) {
      toast({ kind: 'error', title: 'Task not created', description: result.error });
      return;
    }
    setTaskSource(null);
    setDetailEvent(null);
    toast({ kind: 'success', title: 'Task created', description: `${result.task.id} assigned to ${result.task.assigneeName}.` });
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
          <p className="ml-1 text-sm font-semibold text-slate-800">{format(cursor, 'MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 p-0.5">
            {(['month', 'week', 'agenda'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn('rounded px-2.5 py-1 text-xs font-medium capitalize', view === v ? 'bg-brand-600 text-white' : 'text-slate-500 hover:bg-slate-100')}>
                {v}
              </button>
            ))}
          </div>
          {!compact && (
            <Button size="sm" onClick={() => { setEditingEvent(null); setNewEventDate(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Event</Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {ALL_LAYERS.map((l) => (
            <Pill key={l} label={l} active={activeLayers.has(l)} onClick={() => toggleLayer(l)} />
          ))}
        </div>
        <div className="relative shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDepartmentMenuOpen((open) => !open)}
            aria-expanded={departmentMenuOpen}
            aria-controls="calendar-department-filter"
          >
            Department: {departmentFilterLabel}
          </Button>
          {departmentMenuOpen && (
            <div id="calendar-department-filter" className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-slate-200 bg-surface p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter departments</p>
                <div className="flex gap-1">
                  <button type="button" onClick={selectAllDepartments} className="rounded px-2 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-50">All</button>
                  <button type="button" onClick={clearDepartmentFilters} className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100">Clear</button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto pr-1">
                {departmentFilterOptions.map((department) => {
                  const checked = activeDepartmentIds ? activeDepartmentIds.has(department.id) : true;
                  return (
                    <label key={department.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDepartmentFilter(department.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                      />
                      <span className="font-medium text-slate-700">{department.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {view === 'month' && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-7 bg-slate-50 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const dayEvents = eventsOnDay(day);
              const inMonth = isSameMonth(day, cursor);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openNewEventForDate(day);
                  }}
                  title="Right-click to add an event on this date"
                  className={cn(
                    'flex flex-col items-start gap-1 border-b border-r border-slate-100 p-1.5 text-left align-top last:border-r-0 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                    compact ? 'min-h-[64px]' : large ? 'min-h-[128px] p-2' : 'min-h-[88px]',
                    !inMonth && 'bg-slate-50/50 text-slate-300',
                    selectedDate && isSameDay(day, selectedDate) && 'bg-brand-50 ring-1 ring-inset ring-brand-300'
                  )}
                >
                  <span className={cn('flex items-center justify-center rounded-full font-medium', large ? 'h-6 w-6 text-sm' : 'h-5 w-5 text-xs', isToday(day) && 'bg-brand-600 text-white')}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex w-full flex-col gap-0.5">
                    {dayEvents.slice(0, compact ? 2 : large ? 5 : 3).map((e) => (
                      <span key={e.id} onClick={(ev) => { ev.stopPropagation(); setDetailEvent(e); }} className={cn('flex items-center gap-1 truncate rounded px-1 py-0.5 font-medium hover:bg-surface', large ? 'text-[11px] py-1' : 'text-[10px]')} style={{ backgroundColor: `${e.color}1a`, color: e.color }}>
                        <EventDot color={e.color} /> {e.done && <ThumbsUp className="h-3 w-3 shrink-0" />} <span className={cn('truncate', e.done && 'line-through opacity-75')}>{e.title}</span>
                      </span>
                    ))}
                    {dayEvents.length > (compact ? 2 : large ? 5 : 3) && <span className="text-[10px] text-slate-400">+{dayEvents.length - (compact ? 2 : large ? 5 : 3)} more</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="space-y-2">
          {weekDays.map((day) => {
            const dayEvents = eventsOnDay(day);
            return (
              <div key={day.toISOString()} className={cn('rounded-lg border border-slate-200 p-3', isToday(day) && 'border-brand-300 bg-brand-50/30')}>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">{format(day, 'EEEE, MMM d')}</p>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-slate-400">No events scheduled.</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((e) => (
                      <button key={e.id} onClick={() => setDetailEvent(e)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface" style={{ backgroundColor: `${e.color}12` }}>
                        <EventDot color={e.color} />
                        <span className="font-medium text-slate-700">{format(parseISO(e.start), 'h:mm a')}</span>
                        <span className="truncate text-slate-600">{e.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === 'agenda' && (
        agendaEvents.length === 0 ? <EmptyState title="No upcoming events" description="Nothing scheduled for the selected layers." /> : (
          <div className="space-y-1.5">
            {agendaEvents.map((e) => (
              <button key={e.id} onClick={() => setDetailEvent(e)} className="flex w-full items-center gap-3 rounded-lg border border-slate-100 p-2.5 text-left hover:bg-brand-50/40">
                <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-slate-50 py-1.5">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">{format(parseISO(e.start), 'MMM')}</span>
                  <span className="text-sm font-bold text-slate-700">{format(parseISO(e.start), 'd')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{e.title}</p>
                  <p className="truncate text-xs text-slate-500">{format(parseISO(e.start), 'h:mm a')} · {e.layer}{e.location ? ` · ${e.location}` : ''}</p>
                </div>
                <EventDot color={e.color} />
              </button>
            ))}
          </div>
        )
      )}

      {selectedDate && view === 'month' && (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
          {eventsOnDay(selectedDate).length === 0 ? (
            <p className="text-xs text-slate-400">No events on this day.</p>
          ) : (
            <div className="space-y-1">
              {eventsOnDay(selectedDate).map((e) => (
                <button key={e.id} onClick={() => setDetailEvent(e)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50">
                  <EventDot color={e.color} /> <span className="font-medium">{format(parseISO(e.start), 'h:mm a')}</span> <span className="truncate text-slate-600">{e.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Event detail modal */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)} title={detailEvent?.title ?? ''} size="md"
        footer={detailEvent ? (
          <>
            <Button variant={detailEvent.done ? 'outline' : 'secondary'} onClick={() => { toggleEventDone(detailEvent.id, !detailEvent.done); setDetailEvent({ ...detailEvent, done: !detailEvent.done, doneAt: !detailEvent.done ? new Date().toISOString() : null }); }}>
              <ThumbsUp className="h-4 w-4" /> {detailEvent.done ? 'Mark Not Done' : 'Mark Done'}
            </Button>
            {canApprove(effectiveRole) && <Button variant="secondary" onClick={() => openTaskDialog(detailEvent)}><ListChecks className="h-4 w-4" /> Convert to Task</Button>}
            <Button variant="outline" onClick={() => { setDeleteTarget(detailEvent); }}><Trash2 className="h-4 w-4" /> Delete</Button>
            <Button onClick={() => { setEditingEvent(detailEvent); setFormOpen(true); setDetailEvent(null); }}><Pencil className="h-4 w-4" /> Edit</Button>
          </>
        ) : undefined}
      >
        {detailEvent && (
          <div className="space-y-3 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${detailEvent.color}1a`, color: detailEvent.color }}>
              <EventDot color={detailEvent.color} /> {detailEvent.layer}
            </span>
            {detailEvent.done && (
              <p className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-2 text-xs font-medium text-green-700">
                <ThumbsUp className="h-3.5 w-3.5" /> Done{detailEvent.doneBy ? ` by ${detailEvent.doneBy}` : ''}{detailEvent.doneAt ? ` · ${format(parseISO(detailEvent.doneAt), 'MMM d, yyyy h:mm a')}` : ''}
              </p>
            )}
            <p className="text-slate-600">{format(parseISO(detailEvent.start), 'EEEE, MMMM d, yyyy · h:mm a')} – {format(parseISO(detailEvent.end), 'h:mm a')}</p>
            <p className="flex items-center gap-2 text-slate-600">
              <MapPin className="h-4 w-4 text-slate-400" /> Departments: {eventDepartmentIds(detailEvent).map((id) => departmentNameById.get(id) ?? id).join(', ') || 'Not assigned'}
            </p>
            {detailEvent.location && <p className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-slate-400" /> {detailEvent.location}</p>}
            {detailEvent.meetingLink && <p className="flex items-center gap-2 text-brand-600"><Video className="h-4 w-4" /> {detailEvent.meetingLink}</p>}
            {detailEvent.attendees && <p className="flex items-center gap-2 text-slate-600"><Users className="h-4 w-4 text-slate-400" /> {detailEvent.attendees.join(', ')}</p>}
            <p className="flex items-center gap-2 text-slate-600"><Users className="h-4 w-4 text-slate-400" /> Visibility: {detailEvent.visibility ?? 'All employees'}{detailEvent.visibleToUsernames?.length ? ` · ${detailEvent.visibleToUsernames.join(', ')}` : ''}</p>
            {detailEvent.description && <p className="text-slate-600">{detailEvent.description}</p>}
            {detailEvent.attachments && detailEvent.attachments.length > 0 && (
              <div className="rounded-md border border-slate-100 p-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Attachments</p>
                <ul className="space-y-1">
                  {detailEvent.attachments.map((file) => (
                    <li key={`${file.name}:${file.size}`} className="flex items-center gap-2 text-xs text-slate-600">
                      <Paperclip className="h-3.5 w-3.5 text-slate-400" /> {file.name} <span className="text-slate-400">({formatBytes(file.size)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!detailEvent.editable && <p className="flex items-center gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-500"><Paperclip className="h-3.5 w-3.5" /> Imported organizational event — editable for classification and tracking.</p>}
            <button onClick={() => toast({ kind: 'info', title: 'Reminder set', description: 'You will be notified 30 minutes before this event (simulated).' })} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
              <Bell className="h-3.5 w-3.5" /> Set reminder
            </button>
          </div>
        )}
      </Dialog>

      <Dialog open={formOpen} onClose={() => { setFormOpen(false); setEditingEvent(null); setNewEventDate(null); }} title={editingEvent ? 'Edit Event' : 'New Event'} size="md">
        <EventForm
          initial={editingEvent ?? (newEventDate ? { start: `${format(newEventDate, 'yyyy-MM-dd')}T09:00:00`, end: `${format(newEventDate, 'yyyy-MM-dd')}T10:00:00` } : undefined)}
          onCancel={() => { setFormOpen(false); setEditingEvent(null); setNewEventDate(null); }}
          onDelete={editingEvent ? () => { setDeleteTarget(editingEvent); setFormOpen(false); setEditingEvent(null); setNewEventDate(null); } : undefined}
          onSave={handleSaveEvent}
          existingEvents={visibleEvents}
        />
      </Dialog>

      <Dialog
        open={!!taskSource}
        onClose={() => setTaskSource(null)}
        title="Convert Calendar Event to Task"
        description="Assign this event as a real work task to an employee."
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setTaskSource(null)}>Cancel</Button>
            <Button onClick={handleCreateTask}><ListChecks className="h-4 w-4" /> Create Task</Button>
          </>
        }
      >
        {taskSource && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">{taskSource.title}</p>
              <p className="mt-1 text-xs text-slate-500">{format(parseISO(taskSource.start), 'MMM d, yyyy h:mm a')} · {taskSource.layer}</p>
            </div>
            <div>
              <Label htmlFor="task-assignee" required>Assign to</Label>
              <Select id="task-assignee" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}>
                <option value="">Select employee</option>
                {taskDirectoryUsers.map((employee) => (
                  <option key={employee.id} value={employee.username.toLowerCase()}>{directoryDisplayName(employee)}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="task-priority">Priority</Label>
                <Select id="task-priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as typeof taskPriority)}>
                  <option>Low</option>
                  <option>Normal</option>
                  <option>High</option>
                  <option>Urgent</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-due-date">Due date</Label>
                <Input id="task-due-date" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="task-description">Task instructions</Label>
              <Textarea id="task-description" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} />
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) { deletePersonalEvent(deleteTarget.id); toast({ kind: 'info', title: 'Event deleted', description: 'The event and its attachment records were removed.' }); } setDeleteTarget(null); setDetailEvent(null); }}
        title="Delete Event"
        description="This event will be removed from the calendar. Any attachment records connected to it will be removed too."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
