import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { addMonths, addQuarters, addWeeks, addYears, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, max, min, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subMonths, subQuarters, subWeeks, subYears } from 'date-fns';
import { Car, ChevronDown, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, Printer, Wrench } from 'lucide-react';
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
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);

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
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(() => new Set());
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

  function scheduleReportRows() {
    return vehicles.flatMap((vehicle) => {
      const department = departments.find((item) => item.id === vehicle.assignedDepartment)?.shortName ?? vehicle.assignedDepartment ?? 'ISD';
      const schedules = vehicle.schedules.filter((schedule) => schedule.type === 'Preventive Maintenance' || schedule.type === 'Maintenance');
      const shared = { vehicle: `${vehicle.brand} ${vehicle.model}`, plate: vehicle.plateNumber, department, office: vehicle.assignedOffice || 'Department Level / No Office', accountable: vehicle.custodian || '—' };
      if (!schedules.length) return [{ ...shared, type: 'Preventive Maintenance', start: '', end: '', status: 'Not Scheduled' }];
      return schedules.map((schedule) => ({ ...shared, type: schedule.type, start: schedule.startDate, end: schedule.endDate, status: schedule.status }));
    }).sort((left, right) => {
      if (!left.start && !right.start) return left.vehicle.localeCompare(right.vehicle);
      if (!left.start) return 1;
      if (!right.start) return -1;
      return left.start.localeCompare(right.start) || left.vehicle.localeCompare(right.vehicle);
    });
  }

  function reportTable() {
    const rows = scheduleReportRows();
    return `<table><thead><tr><th>No.</th><th>Vehicle</th><th>Plate No.</th><th>Department</th><th>Assignment</th><th>Accountable Person</th><th>Schedule</th><th>Start Date</th><th>End Date</th><th>Status</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.vehicle)}</td><td>${escapeHtml(row.plate)}</td><td>${escapeHtml(row.department)}</td><td>${escapeHtml(row.office)}</td><td>${escapeHtml(row.accountable)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.start)}</td><td>${escapeHtml(row.end)}</td><td>${escapeHtml(row.status)}</td></tr>`).join('')}</tbody></table>`;
  }

  function printSchedule() {
    const printWindow = window.open('', '_blank', 'width=1200,height=800');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>Preventive Maintenance Schedule</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;margin:0 0 4px}.meta{color:#555;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#e8f3ec;font-weight:700}tr:nth-child(even){background:#f7f7f7}</style></head><body><h1>Preventive Maintenance Schedule</h1><div class="meta">Reporting period: ${escapeHtml(period)} · Printed ${escapeHtml(format(new Date(), 'MMM d, yyyy h:mm a'))}</div>${reportTable()}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function exportScheduleExcel() {
    const workbook = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#dfeee5}</style></head><body><h2>Preventive Maintenance Schedule</h2><p>Reporting period: ${escapeHtml(period)}</p>${reportTable()}</body></html>`;
    const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `preventive-maintenance-schedule-${format(start, 'yyyy-MM-dd')}-${format(end, 'yyyy-MM-dd')}.xls`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div>
    <PageHeader title="Preventive Maintenance Schedule" description="Fleet maintenance Gantt chart grouped by vehicle type." crumbs={[{ label: 'Vehicle Fleet Management System', to: '/workspace/preview/ISD/tools/Vehicle%20Fleet%20Management%20System' }, { label: 'Maintenance Schedule' }]} actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={printSchedule}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={exportScheduleExcel}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button><Button variant="outline" onClick={() => window.close()}><ChevronLeft className="h-4 w-4" /> Close Schedule</Button></div>} />
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Metric label="Fleet Vehicles" value={vehicles.length}/><Metric label="Vehicle Types" value={grouped.length}/><Metric label="Preventive Maintenance Activities" value={maintenanceCount}/></div>
    <Card className="mb-4 p-3"><div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex rounded-lg border border-slate-200 p-1">{VIEWS.map((item) => <button key={item.value} onClick={() => setView(item.value)} className={cn('rounded-md px-3 py-1.5 text-xs font-semibold', view === item.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>{item.label}</button>)}</div>
      <div className="flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => setAnchor((value) => move(view, value, -1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setAnchor(new Date())}>Today</Button><span className="min-w-44 text-center text-sm font-bold">{period}</span><Button size="icon" variant="outline" onClick={() => setAnchor((value) => move(view, value, 1))}><ChevronRight className="h-4 w-4" /></Button></div>
      <div className="flex flex-wrap gap-2 text-[11px]"><Legend color="bg-blue-500" label="Scheduled"/><Legend color="bg-amber-500" label="In Progress"/><Legend color="bg-emerald-500" label="Completed"/><Legend color="bg-red-500" label="Overdue"/></div>
    </div></Card>
    {grouped.length === 0 ? <Card className="p-12 text-center"><Car className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="font-medium">No vehicles registered</p></Card> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-surface"><div className="min-w-[900px]">
      <div className="grid grid-cols-[280px_1fr] border-b border-slate-200 bg-slate-50"><div className="flex items-center px-4 py-3 text-xs font-bold uppercase text-slate-500">Vehicle / Assignment</div><div className="relative grid" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>{slots.map((slot) => <div key={slot.key} className="border-l border-slate-200 px-0.5 py-2 text-center"><p className="text-[10px] font-semibold uppercase text-slate-500">{slot.top}</p><p className="text-[10px] text-slate-400">{slot.bottom}</p></div>)}</div></div>
      {grouped.map(([type, typeVehicles]) => <section key={type}><div className="flex items-center gap-2 border-b border-slate-200 bg-brand-50 px-4 py-2"><Car className="h-4 w-4 text-brand-700" /><span className="text-sm font-bold text-brand-800">{type}</span><Badge>{typeVehicles.length}</Badge></div>{typeVehicles.map((vehicle) => {
        const maintenance = vehicle.schedules.filter((schedule) => schedule.type === 'Preventive Maintenance' || schedule.type === 'Maintenance');
        const childActivities = maintenance.flatMap((schedule) => schedule.checklist.map((item, index) => ({ schedule, item, sequence: index + 1 })));
        const expanded = expandedVehicles.has(vehicle.id);
        return <div key={vehicle.id} className="border-b border-slate-200 last:border-0">
          <div className="grid min-h-20 grid-cols-[280px_1fr] bg-surface"><button type="button" disabled={childActivities.length === 0} aria-expanded={childActivities.length ? expanded : undefined} onClick={() => setExpandedVehicles((current) => { const next = new Set(current); if (next.has(vehicle.id)) next.delete(vehicle.id); else next.add(vehicle.id); return next; })} className="flex items-center gap-3 border-r border-slate-200 px-4 py-3 text-left enabled:hover:bg-slate-50 disabled:cursor-default">{childActivities.length > 0 ? <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', !expanded && '-rotate-90')} /> : <span className="w-4" />}{vehicle.image ? <img src={vehicle.image.dataUrl} alt="" className="h-11 w-14 rounded object-cover" /> : <span className="grid h-11 w-14 place-items-center rounded bg-slate-100"><Car className="h-4 w-4 text-slate-400" /></span>}<div className="min-w-0"><p className="truncate text-sm font-semibold">{vehicle.brand} {vehicle.model}</p><p className="text-xs text-slate-500">{vehicle.plateNumber} · {departments.find((department) => department.id === vehicle.assignedDepartment)?.shortName ?? vehicle.assignedDepartment ?? 'ISD'}</p><p className="truncate text-[11px] text-slate-400">{vehicle.assignedOffice || 'Department Level / No Office'}{childActivities.length > 0 ? ` · ${childActivities.length} checklist items` : ''}</p></div></button><TimelineGrid slots={slots} todayOffset={todayOffset} totalDays={totalDays}>{maintenance.length === 0 ? <div className="relative z-20 flex h-full items-center px-4"><span className="flex items-center gap-1.5 text-xs text-amber-700"><Clock3 className="h-3.5 w-3.5" /> No preventive maintenance scheduled</span></div> : maintenance.map((schedule, index) => <ScheduleBar key={schedule.id} schedule={schedule} style={barStyle(schedule)} top={12 + index * 27} label={`${schedule.type} · ${schedule.status}`} />)}</TimelineGrid></div>
          {expanded && childActivities.map(({ schedule, item, sequence }) => <div key={`${schedule.id}-${item.id}`} className="grid min-h-11 grid-cols-[280px_1fr] border-t border-slate-100 bg-slate-50/40"><div className="flex min-w-0 items-center gap-2 border-r border-slate-200 py-2 pl-10 pr-3"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{sequence}</span><div className="min-w-0"><p className="truncate text-xs font-medium" title={item.label}>{item.label}</p><p className="text-[10px] text-slate-400">{schedule.type} · {item.checked ? 'Completed' : 'Pending'}</p></div></div><TimelineGrid slots={slots} todayOffset={todayOffset} totalDays={totalDays}><ScheduleBar schedule={schedule} style={barStyle(schedule)} top={9} label={item.checked ? 'Done' : 'To-do'} muted={!item.checked} /></TimelineGrid></div>)}
        </div>;
      })}</section>)}
    </div></div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></Card>; }
function Legend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-sm', color)} />{label}</span>; }
function TimelineGrid({ slots, todayOffset, totalDays, children }: { slots: { key: string }[]; todayOffset: number; totalDays: number; children: ReactNode }) {
  return <div className="relative overflow-hidden bg-surface"><div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>{slots.map((slot) => <div key={slot.key} className="border-l border-slate-100" />)}</div>{todayOffset >= 0 && todayOffset < totalDays && <div className="absolute inset-y-0 z-10 w-px bg-red-400" style={{ left: `${(todayOffset + .5) / totalDays * 100}%` }} title="Today" />}{children}</div>;
}
function ScheduleBar({ schedule, style, top, label, muted = false }: { schedule: FleetSchedule; style: { left: string; width: string } | null; top: number; label: string; muted?: boolean }) {
  if (!style) return null;
  const color = muted ? 'bg-slate-400' : schedule.status === 'Completed' ? 'bg-emerald-500' : schedule.status === 'In Progress' ? 'bg-amber-500' : schedule.status === 'Overdue' ? 'bg-red-500' : 'bg-blue-500';
  return <div title={`${label}: ${schedule.startDate} to ${schedule.endDate}`} className={cn('absolute z-20 h-6 overflow-hidden rounded-md px-2 text-[10px] font-semibold leading-6 text-white shadow-sm', color)} style={{ ...style, top } as CSSProperties}><Wrench className="mr-1 inline h-3 w-3" />{label}</div>;
}
