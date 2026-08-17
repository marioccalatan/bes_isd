import { useMemo, useState } from 'react';
import {
  addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, format, addDays, subDays, isToday, parseISO,
} from 'date-fns';
import {
  ChevronLeft, ChevronRight, MapPin, Video, Users, Pencil, Trash2, Plus, AlertTriangle, Paperclip, Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarLayer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Pill } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';

const ALL_LAYERS: CalendarLayer[] = ['Enterprise-wide', 'Management', 'Department', 'Training', 'Compliance', 'Projects', 'Maintenance', 'Personal'];

function EventDot({ color }: { color: string }) {
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function EventForm({ initial, onSave, onCancel, existingEvents }: { initial?: Partial<CalendarEvent>; onSave: (v: { title: string; date: string; startTime: string; endTime: string; location: string; description: string }) => void; onCancel: () => void; existingEvents: CalendarEvent[] }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.start ? initial.start.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(initial?.start ? initial.start.slice(11, 16) : '09:00');
  const [endTime, setEndTime] = useState(initial?.end ? initial.end.slice(11, 16) : '10:00');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState('');

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
    onSave({ title: title.trim(), date, startTime, endTime, location, description });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="ev-title" required>Event Title</Label>
        <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. One-on-one with GM" />
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
      <div>
        <Label htmlFor="ev-desc">Description</Label>
        <Textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
      </div>
      {conflicts.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-gold-200 bg-gold-50 p-2.5 text-xs text-gold-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Possible conflict with: {conflicts.map((c) => c.title).join(', ')}</span>
        </div>
      )}
      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save Event</Button>
      </div>
    </div>
  );
}

type CalendarSize = 'compact' | 'default' | 'large';

export function EnterpriseCalendar({ size = 'default', autoOpenNew = false }: { size?: CalendarSize; autoOpenNew?: boolean }) {
  const compact = size === 'compact';
  const large = size === 'large';
  const { events, addPersonalEvent, updatePersonalEvent, deletePersonalEvent } = useData();
  const { toast } = useToast();
  const [view, setView] = useState<'month' | 'week' | 'agenda'>('month');
  const [cursor, setCursor] = useState(new Date());
  const [activeLayers, setActiveLayers] = useState<Set<CalendarLayer>>(new Set(ALL_LAYERS));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [formOpen, setFormOpen] = useState(autoOpenNew);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  const visibleEvents = useMemo(() => events.filter((e) => activeLayers.has(e.layer)), [events, activeLayers]);

  function toggleLayer(l: CalendarLayer) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l); else next.add(l);
      return next;
    });
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

  function handleSaveEvent(v: { title: string; date: string; startTime: string; endTime: string; location: string; description: string }) {
    const start = `${v.date}T${v.startTime}:00`;
    const end = `${v.date}T${v.endTime}:00`;
    if (editingEvent) {
      updatePersonalEvent(editingEvent.id, { title: v.title, start, end, location: v.location, description: v.description });
      toast({ kind: 'success', title: 'Event updated' });
    } else {
      addPersonalEvent({ title: v.title, start, end, location: v.location, description: v.description, layer: 'Personal' });
      toast({ kind: 'success', title: 'Personal event created' });
    }
    setFormOpen(false);
    setEditingEvent(null);
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
            <Button size="sm" onClick={() => { setEditingEvent(null); setFormOpen(true); }}><Plus className="h-4 w-4" /> New Event</Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {ALL_LAYERS.map((l) => (
          <Pill key={l} label={l} active={activeLayers.has(l)} onClick={() => toggleLayer(l)} />
        ))}
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
                        <EventDot color={e.color} /> <span className="truncate">{e.title}</span>
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
        footer={detailEvent?.editable ? (
          <>
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
            <p className="text-slate-600">{format(parseISO(detailEvent.start), 'EEEE, MMMM d, yyyy · h:mm a')} – {format(parseISO(detailEvent.end), 'h:mm a')}</p>
            {detailEvent.location && <p className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-slate-400" /> {detailEvent.location}</p>}
            {detailEvent.meetingLink && <p className="flex items-center gap-2 text-brand-600"><Video className="h-4 w-4" /> {detailEvent.meetingLink}</p>}
            {detailEvent.attendees && <p className="flex items-center gap-2 text-slate-600"><Users className="h-4 w-4 text-slate-400" /> {detailEvent.attendees.join(', ')}</p>}
            {detailEvent.description && <p className="text-slate-600">{detailEvent.description}</p>}
            {!detailEvent.editable && (
              <p className="flex items-center gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-500"><Paperclip className="h-3.5 w-3.5" /> Organizational event — view only.</p>
            )}
            <button onClick={() => toast({ kind: 'info', title: 'Reminder set', description: 'You will be notified 30 minutes before this event (simulated).' })} className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
              <Bell className="h-3.5 w-3.5" /> Set reminder
            </button>
          </div>
        )}
      </Dialog>

      <Dialog open={formOpen} onClose={() => { setFormOpen(false); setEditingEvent(null); }} title={editingEvent ? 'Edit Personal Event' : 'New Personal Event'} size="md">
        <EventForm
          initial={editingEvent ?? undefined}
          onCancel={() => { setFormOpen(false); setEditingEvent(null); }}
          onSave={handleSaveEvent}
          existingEvents={visibleEvents}
        />
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) { deletePersonalEvent(deleteTarget.id); toast({ kind: 'info', title: 'Event deleted' }); } setDeleteTarget(null); setDetailEvent(null); }}
        title="Delete Personal Event"
        description="This personal calendar event will be permanently removed."
        confirmLabel="Delete"
        destructive
      />
    </div>
  );
}
