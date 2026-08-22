import { useEffect, useMemo, useState } from 'react';
import { addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, max, min, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subMonths, subQuarters, subWeeks, subYears } from 'date-fns';
import { Car, ChevronLeft, ChevronRight, Clock3, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { FLEET_STORAGE_KEY, loadFleetVehicles, type FleetSchedule, type FleetVehicle } from '@/components/fleet/VehicleFleetManagement';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { fetchFleetVehicles } from '@/lib/api';
import { cn } from '@/lib/utils';

type ViewMode = 'week' | 'month' | 'quarter' | 'year';
const VIEWS: { value: ViewMode; label: string }[] = [{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'year', label: 'Yearly' }];
const toDate = (value: string) => new Date(`${value}T00:00:00`);

function viewRange(mode: ViewMode, anchor: Date) {
  if (mode === 'week') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  if (mode === 'month') return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  if (mode === 'quarter') return { start: startOfQuarter(anchor), end: endOfQuarter(anchor) };
  return { start: startOfYear(anchor), end: endOfYear(anchor) };
}
function move(mode: ViewMode, anchor: Date, direction: -1 | 1) {
  if (mode === 'week') return direction < 0 ? subWeeks(anchor, 1) : addWeeks(anchor, 1);
  if (mode === 'month') return direction < 0 ? subMonths(anchor, 1) : addMonths(anchor, 1);
  if (mode === 'quarter') return direction < 0 ? subQuarters(anchor, 1) : addQuarters(anchor, 1);
  return direction < 0 ? subYears(anchor, 1) : addYears(anchor, 1);
}

export default function VehicleMaintenanceSchedule() {
  const { departments } = useData();
  const { token } = useAuth();
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(loadFleetVehicles);
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(new Date());
  const { start, end } = viewRange(view, anchor);
  const totalDays = differenceInCalendarDays(end, start) + 1;
  const todayOffset = differenceInCalendarDays(new Date(), start);
  const grouped = useMemo(() => {
    const result = new Map<string, typeof vehicles>();
    vehicles.forEach((vehicle) => result.set(vehicle.type || 'Other', [...(result.get(vehicle.type || 'Other') ?? []), vehicle]));
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [vehicles]);
  const slots = view === 'week'
    ? eachDayOfInterval({ start, end }).map((date) => ({ key: format(date, 'yyyy-MM-dd'), top: format(date, 'EEE'), bottom: format(date, 'd') }))
    : view === 'month'
      ? eachDayOfInterval({ start, end }).map((date) => ({ key: format(date, 'yyyy-MM-dd'), top: date.getDay() === 1 ? format(date, 'EEE') : '', bottom: date.getDate() % 3 === 1 ? format(date, 'd') : '' }))
      : eachMonthOfInterval({ start, end }).map((date) => ({ key: format(date, 'yyyy-MM'), top: format(date, 'MMM'), bottom: view === 'quarter' ? format(date, 'yyyy') : '' }));
  const period = view === 'week' ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` : view === 'month' ? format(start, 'MMMM yyyy') : view === 'quarter' ? `Q${Math.floor(start.getMonth() / 3) + 1} ${format(start, 'yyyy')}` : format(start, 'yyyy');
  const maintenanceCount = vehicles.flatMap((vehicle) => vehicle.schedules).filter((schedule) => schedule.type === 'Preventive Maintenance' || schedule.type === 'Maintenance').length;

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchFleetVehicles<FleetVehicle[]>(token).then((serverVehicles) => {
      if (cancelled) return;
      if (serverVehicles.length > 0) {
        setVehicles(serverVehicles);
        localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(serverVehicles));
      }
    }).catch((error) => console.warn('Unable to load the Oracle fleet schedule.', error));
    return () => { cancelled = true; };
  }, [token]);

  function barStyle(schedule: FleetSchedule) {
    if (toDate(schedule.endDate) < start || toDate(schedule.startDate) > end) return null;
    const clippedStart = max([toDate(schedule.startDate), start]);
    const clippedEnd = min([toDate(schedule.endDate), end]);
    return { left: `${differenceInCalendarDays(clippedStart, start) / totalDays * 100}%`, width: `${Math.max((differenceInCalendarDays(clippedEnd, clippedStart) + 1) / totalDays * 100, 1.2)}%` };
  }

  return <div>
    <PageHeader title="Preventive Maintenance Schedule" description="Fleet maintenance Gantt chart grouped by vehicle type." crumbs={[{ label: 'Vehicle Fleet Management System', to: '/workspace/preview/ISD/tools/Vehicle%20Fleet%20Management%20System' }, { label: 'Maintenance Schedule' }]} actions={<Button variant="outline" onClick={() => window.close()}><ChevronLeft className="h-4 w-4" /> Close Schedule</Button>} />
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Metric label="Fleet Vehicles" value={vehicles.length}/><Metric label="Vehicle Types" value={grouped.length}/><Metric label="Preventive Maintenance Activities" value={maintenanceCount}/></div>
    <Card className="mb-4 p-3"><div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border border-slate-200 p-1">{VIEWS.map((item) => <button key={item.value} onClick={() => setView(item.value)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', view === item.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>{item.label}</button>)}</div>
      <div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => setAnchor((value) => move(view, value, -1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setAnchor(new Date())}>Today</Button><span className="min-w-44 text-center text-sm font-bold">{period}</span><Button size="icon" variant="outline" onClick={() => setAnchor((value) => move(view, value, 1))}><ChevronRight className="h-4 w-4" /></Button></div>
      <div className="flex flex-wrap gap-2 text-[11px]"><Legend color="bg-blue-500" label="Scheduled"/><Legend color="bg-amber-500" label="In Progress"/><Legend color="bg-emerald-500" label="Completed"/><Legend color="bg-red-500" label="Overdue"/></div>
    </div></Card>
    {grouped.length === 0 ? <Card className="p-12 text-center"><Car className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="font-medium">No vehicles registered</p></Card> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface"><div className="min-w-[900px]">
      <div className="grid grid-cols-[280px_1fr] border-b border-slate-200 bg-slate-50"><div className="flex items-center px-4 py-3 text-xs font-bold uppercase text-slate-500">Vehicle / Assignment</div><div className="relative grid" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>{slots.map((slot) => <div key={slot.key} className="border-l border-slate-200 px-0.5 py-2 text-center"><p className="text-[10px] font-semibold uppercase text-slate-500">{slot.top}</p><p className="text-[10px] text-slate-400">{slot.bottom}</p></div>)}</div></div>
      {grouped.map(([type, typeVehicles]) => <section key={type}><div className="flex items-center gap-2 border-b border-slate-200 bg-brand-50 px-4 py-2"><Car className="h-4 w-4 text-brand-700" /><span className="text-sm font-bold text-brand-800">{type}</span><Badge>{typeVehicles.length}</Badge></div>{typeVehicles.map((vehicle) => { const maintenance = vehicle.schedules.filter((schedule) => schedule.type === 'Preventive Maintenance' || schedule.type === 'Maintenance'); return <div key={vehicle.id} className="grid min-h-20 grid-cols-[280px_1fr] border-b border-slate-100 last:border-0"><div className="flex items-center gap-3 border-r border-slate-200 px-4 py-3">{vehicle.image ? <img src={vehicle.image.dataUrl} className="h-11 w-14 rounded object-cover" /> : <span className="grid h-11 w-14 place-items-center rounded bg-slate-100"><Car className="h-4 w-4 text-slate-400" /></span>}<div className="min-w-0"><p className="truncate text-sm font-semibold">{vehicle.brand} {vehicle.model}</p><p className="text-xs text-slate-500">{vehicle.plateNumber} · {departments.find((department) => department.id === vehicle.assignedDepartment)?.shortName ?? vehicle.assignedDepartment ?? 'ISD'}</p><p className="truncate text-[11px] text-slate-400">{vehicle.assignedOffice || 'Department Level / No Office'}</p></div></div><div className="relative overflow-hidden bg-surface">
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>{slots.map((slot) => <div key={slot.key} className="border-l border-slate-100" />)}</div>
        {todayOffset >= 0 && todayOffset < totalDays && <div className="absolute inset-y-0 z-10 w-px bg-red-400" style={{ left: `${(todayOffset + .5) / totalDays * 100}%` }} title="Today" />}
        {maintenance.length === 0 ? <div className="relative z-20 flex h-full items-center px-4"><span className="flex items-center gap-1.5 text-xs text-amber-700"><Clock3 className="h-3.5 w-3.5" /> No preventive maintenance scheduled</span></div> : maintenance.map((schedule, index) => { const style = barStyle(schedule); if (!style) return null; const color = schedule.status === 'Completed' ? 'bg-emerald-500' : schedule.status === 'In Progress' ? 'bg-amber-500' : schedule.status === 'Overdue' ? 'bg-red-500' : 'bg-blue-500'; return <div key={schedule.id} title={`${schedule.status}: ${schedule.startDate} to ${schedule.endDate}`} className={cn('absolute z-20 h-6 overflow-hidden rounded-md px-2 text-[10px] font-semibold leading-6 text-white shadow-sm', color)} style={{ ...style, top: `${12 + index * 27}px` }}><Wrench className="mr-1 inline h-3 w-3" />{schedule.status}</div>; })}
      </div></div>; })}</section>)}
    </div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></Card>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-sm', color)} />{label}</span>; }
