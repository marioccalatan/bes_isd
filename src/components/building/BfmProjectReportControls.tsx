import { useMemo, useState } from 'react';
import { endOfYear, format, startOfYear } from 'date-fns';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { Label, Select } from '@/components/ui/input';
import type { BfmFacility, BfmProject } from '@/lib/api';

type Period = 'year' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2' | 'custom';
type GanttScale = 'yearly' | 'quarterly' | 'monthly' | 'weekly';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);

export function BfmProjectReportControls({ facilities, projects, includeDateFilter = false }: { facilities: BfmFacility[]; projects: BfmProject[]; includeDateFilter?: boolean }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'print' | 'excel'>('print');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [period, setPeriod] = useState<Period>('year');
  const [printAsGantt, setPrintAsGantt] = useState(false);
  const [ganttScale, setGanttScale] = useState<GanttScale>('monthly');
  const [startDate, setStartDate] = useState(() => format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(endOfYear(new Date()), 'yyyy-MM-dd'));
  const facilityById = useMemo(() => new Map(facilities.map((facility) => [facility.id, facility])), [facilities]);
  const roots = useMemo(() => facilities.filter((facility) => !facility.parentId || !facilityById.has(facility.parentId)).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [facilities, facilityById]);
  const groups = useMemo(() => roots.map((root) => { const children = facilities.filter((facility) => facility.parentId === root.id).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); return { root, options: children.length ? children : [root] }; }), [facilities, roots]);
  const allIds = useMemo(() => groups.flatMap((group) => group.options.map((facility) => facility.id)), [groups]);
  const isWithin = (facilityId: string, ancestorId: string) => { let current = facilityById.get(facilityId); while (current) { if (current.id === ancestorId) return true; current = current.parentId ? facilityById.get(current.parentId) : undefined; } return false; };
  const countProjects = (facilityId: string) => projects.filter((project) => isWithin(project.facilityId, facilityId)).length;
  function show(nextAction: 'print' | 'excel') { setAction(nextAction); setSelectedIds(new Set(allIds)); setOpen(true); }
  function applyPeriod(value: Period) { setPeriod(value); if (value === 'custom') return; const year = new Date().getFullYear(); const ranges: Record<Exclude<Period, 'custom'>, [number, number]> = { year: [1, 12], q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12], h1: [1, 6], h2: [7, 12] }; const [first, last] = ranges[value]; setStartDate(format(new Date(year, first - 1, 1), 'yyyy-MM-dd')); setEndDate(format(new Date(year, last, 0), 'yyyy-MM-dd')); }
  function table() {
    const selected = projects.filter((project) => [...selectedIds].some((id) => isWithin(project.facilityId, id)) && (!includeDateFilter || ((project.startDate || project.targetDate) <= endDate && project.targetDate >= startDate))).sort((a, b) => (a.startDate || a.targetDate).localeCompare(b.startDate || b.targetDate));
    const rows = selected.map((project, index) => { const parts: string[] = []; let current = facilityById.get(project.facilityId); while (current) { parts.unshift(current.name); current = current.parentId ? facilityById.get(current.parentId) : undefined; } return `<tr><td>${index + 1}</td><td>${escapeHtml(parts.join(' › '))}</td><td>${escapeHtml(project.title)}</td><td>${escapeHtml(project.startDate || project.targetDate)}</td><td>${escapeHtml(project.targetDate)}</td><td>${escapeHtml(project.status)}</td><td>${escapeHtml(project.priority)}</td><td>${escapeHtml(project.budgetStatus)}</td></tr>`; }).join('');
    return `<table><thead><tr><th>No.</th><th>Facility</th><th>Project</th><th>Start Date</th><th>Target Date</th><th>Status</th><th>Priority</th><th>Budget Status</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No projects selected.</td></tr>'}</tbody></table>`;
  }
  function ganttTable() {
    const rangeStart = new Date(`${startDate}T00:00:00`).getTime();
    const rangeEnd = new Date(`${endDate}T23:59:59`).getTime();
    const duration = Math.max(1, rangeEnd - rangeStart);
    const colors: Record<string, string> = { Planned: '#64748b', 'In Progress': '#2563eb', 'On Hold': '#f59e0b', Completed: '#16a34a', Cancelled: '#ef4444' };
    const columns: Array<{ label: string; start: number; end: number }> = [];
    const cursor = new Date(`${startDate}T00:00:00`); const finalDate = new Date(`${endDate}T23:59:59`);
    while (cursor <= finalDate) {
      const columnStart = new Date(cursor);
      let next: Date; let label: string;
      if (ganttScale === 'yearly') { label = String(cursor.getFullYear()); next = new Date(cursor.getFullYear() + 1, 0, 1); }
      else if (ganttScale === 'quarterly') { label = `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`; next = new Date(cursor.getFullYear(), Math.floor(cursor.getMonth() / 3) * 3 + 3, 1); }
      else if (ganttScale === 'monthly') { label = cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); }
      else { label = cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); next = new Date(cursor); next.setDate(next.getDate() + 7); }
      columns.push({ label, start: Math.max(rangeStart, columnStart.getTime()), end: Math.min(rangeEnd, next.getTime() - 1) }); cursor.setTime(next.getTime());
    }
    const scaleHeader = columns.map((column) => `<span style="width:${Math.max(.5, (column.end - column.start) / duration * 100)}%">${escapeHtml(column.label)}</span>`).join('');
    const selected = projects.filter((project) => [...selectedIds].some((id) => isWithin(project.facilityId, id)) && (project.startDate || project.targetDate) <= endDate && project.targetDate >= startDate).sort((a, b) => (a.startDate || a.targetDate).localeCompare(b.startDate || b.targetDate));
    const rows = selected.map((project) => {
      const parts: string[] = []; let current = facilityById.get(project.facilityId); while (current) { parts.unshift(current.name); current = current.parentId ? facilityById.get(current.parentId) : undefined; }
      const projectStart = Math.max(rangeStart, new Date(`${project.startDate || project.targetDate}T00:00:00`).getTime());
      const projectEnd = Math.min(rangeEnd, new Date(`${project.targetDate}T23:59:59`).getTime());
      const left = Math.max(0, (projectStart - rangeStart) / duration * 100);
      const width = Math.max(1.5, (projectEnd - projectStart) / duration * 100);
      return `<tr><td><strong>${escapeHtml(project.title)}</strong><small>${escapeHtml(parts.join(' › '))}</small></td><td><div class="track" style="background-size:${100 / Math.max(columns.length, 1)}% 100%"><div class="bar" style="left:${left}%;width:${width}%;background:${colors[project.status] || '#64748b'}">${escapeHtml(project.description?.trim() || 'No notes')}</div></div><div class="dates">${escapeHtml(project.startDate || project.targetDate)} – ${escapeHtml(project.targetDate)} · ${escapeHtml(project.status)}</div></td></tr>`;
    }).join('');
    return `<table class="gantt"><thead><tr><th>Facility / Project</th><th><div class="scale">${scaleHeader}</div></th></tr></thead><tbody>${rows || '<tr><td colspan="2">No projects selected.</td></tr>'}</tbody></table>`;
  }
  function process() { if (!selectedIds.size) return; const content = action === 'print' && printAsGantt ? ganttTable() : table(); const periodText = includeDateFilter ? `<p>Period: ${escapeHtml(startDate)} to ${escapeHtml(endDate)}</p>` : ''; if (action === 'print') { const popup = window.open('', '_blank', 'width=1200,height=800'); if (!popup) return; popup.document.write(`<!doctype html><html><head><title>Building and Facilities Projects</title><style>@page{size:landscape;margin:12mm}body{font-family:Arial;color:#111}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#dfeee5}.gantt th:first-child,.gantt td:first-child{width:250px}.gantt small{display:block;color:#555;margin-top:3px}.scale{display:flex;width:100%;overflow:hidden}.scale span{box-sizing:border-box;display:block;overflow:hidden;border-right:1px solid #94a3b8;padding:4px 1px;text-align:center;font-size:8px;white-space:nowrap}.scale span:last-child{border-right:0}.track{position:relative;height:28px;border:1px solid #cbd5e1;background:repeating-linear-gradient(90deg,#f8fafc 0,#f8fafc 9.8%,#e2e8f0 10%)}.bar{position:absolute;top:4px;height:18px;min-width:12px;border-radius:3px;padding:2px 5px;overflow:hidden;white-space:nowrap;color:#fff;font-size:9px;font-weight:700}.dates{margin-top:3px;color:#555;font-size:8px}</style></head><body><h1>Building and Facilities Projects${printAsGantt ? ' — Gantt Chart' : ''}</h1>${periodText}${content}</body></html>`); popup.document.close(); popup.focus(); popup.print(); } else { const blob = new Blob([`<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#dfeee5}</style></head><body><h2>Building and Facilities Projects</h2>${periodText}${content}</body></html>`], { type: 'application/vnd.ms-excel' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'building-facilities-projects.xls'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } setOpen(false); }
  return <><Button variant="outline" onClick={() => show('print')}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => show('excel')}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button><Dialog open={open} onClose={() => setOpen(false)} title={action === 'print' ? 'Print Project Report' : 'Export Project Report'} description="Select the facilities to include in the project report." size="md" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!selectedIds.size} onClick={process}>{action === 'print' ? 'Print Selected' : 'Export Selected'}</Button></>}><div className="space-y-4">{includeDateFilter && <div className="rounded-lg border border-slate-200 p-3"><Label>Reporting Period</Label><Select className="mt-1" value={period} onChange={(event) => applyPeriod(event.target.value as Period)}><option value="year">This Year</option><option value="q1">Q1</option><option value="q2">Q2</option><option value="q3">Q3</option><option value="q4">Q4</option><option value="h1">January–June</option><option value="h2">July–December</option><option value="custom">Custom</option></Select>{period === 'custom' ? <div className="mt-3"><DateRangePicker label="Custom Date Range" startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} /></div> : <p className="mt-2 text-xs text-slate-500">{startDate} – {endDate}</p>}</div>}{action === 'print' && <div className="rounded-lg border border-brand-200 bg-brand-50 p-3"><label className="flex cursor-pointer items-center gap-3 font-semibold text-brand-800"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={printAsGantt} onChange={(event) => setPrintAsGantt(event.target.checked)} />Print as Gantt Chart</label>{printAsGantt && <div className="mt-3"><Label>Gantt Date Columns</Label><Select className="mt-1" value={ganttScale} onChange={(event) => setGanttScale(event.target.value as GanttScale)}><option value="yearly">Yearly</option><option value="quarterly">Quarterly</option><option value="monthly">Monthly</option><option value="weekly">Weekly</option></Select></div>}</div>}<label className="flex items-center gap-3 rounded-lg border bg-slate-50 p-3 font-semibold"><input type="checkbox" checked={allIds.length > 0 && selectedIds.size === allIds.length} onChange={(event) => setSelectedIds(event.target.checked ? new Set(allIds) : new Set())} />All facilities</label>{groups.map(({ root, options }) => <div key={root.id} className="rounded-lg border p-3"><p className="mb-2 font-semibold">{root.name}</p><div className="grid gap-2 sm:grid-cols-2">{options.map((facility) => <label key={facility.id} className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={selectedIds.has(facility.id)} onChange={() => setSelectedIds((current) => { const next = new Set(current); next.has(facility.id) ? next.delete(facility.id) : next.add(facility.id); return next; })} />{facility.name}<Badge>{countProjects(facility.id)}</Badge></label>)}</div></div>)}</div></Dialog></>;
}
