import { Fragment, useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, eachDayOfInterval, endOfYear, format, startOfWeek, startOfYear } from 'date-fns';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ExternalLink, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
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
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
type ReportPeriod = 'year' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2' | 'custom';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportAction, setReportAction] = useState<'print' | 'form' | 'excel'>('print');
  const [reportFacilityIds, setReportFacilityIds] = useState<Set<string>>(() => new Set());
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('year');
  const [reportStartDate, setReportStartDate] = useState(() => format(startOfYear(new Date()), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState(() => format(endOfYear(new Date()), 'yyyy-MM-dd'));
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
  const reportFacilityGroups = useMemo(() => rootFacilities.map((root) => {
    const children = (data?.facilities ?? []).filter((facility) => facility.parentId === root.id).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    return { root, options: children.length ? children : [root] };
  }), [data?.facilities, rootFacilities]);
  const allReportFacilityIds = useMemo(() => reportFacilityGroups.flatMap((group) => group.options.map((facility) => facility.id)), [reportFacilityGroups]);
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

  function openReport(action: 'print' | 'form' | 'excel') {
    setReportAction(action);
    setReportFacilityIds(new Set(allReportFacilityIds));
    setReportOpen(true);
  }

  function applyReportPeriod(period: ReportPeriod) {
    setReportPeriod(period);
    if (period === 'custom') return;
    const year = new Date().getFullYear();
    const ranges: Record<Exclude<ReportPeriod, 'custom'>, [number, number]> = { year: [1, 12], q1: [1, 3], q2: [4, 6], q3: [7, 9], q4: [10, 12], h1: [1, 6], h2: [7, 12] };
    const [startMonth, endMonth] = ranges[period];
    setReportStartDate(format(new Date(year, startMonth - 1, 1), 'yyyy-MM-dd'));
    setReportEndDate(format(new Date(year, endMonth, 0), 'yyyy-MM-dd'));
  }

  function reportPeriodKey(frequency: string, date: Date) {
    const normalized = frequency.trim().toLowerCase();
    if (normalized === 'daily' || normalized === 'custom') return format(date, 'yyyy-MM-dd');
    if (normalized === 'weekly') return `W:${format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')}`;
    if (normalized === 'monthly') return `M:${format(date, 'yyyy-MM')}`;
    if (normalized === 'quarterly') return `Q:${date.getFullYear()}-${Math.floor(date.getMonth() / 3) + 1}`;
    if (normalized === 'semi-annual') return `H:${date.getFullYear()}-${date.getMonth() < 6 ? 1 : 2}`;
    if (normalized === 'annual') return `Y:${date.getFullYear()}`;
    return format(date, 'yyyy-MM-dd');
  }

  function reportTable() {
    const selectedTodos = (data?.todos ?? []).filter((todo) => [...reportFacilityIds].some((facilityId) => isWithinFacility(todo.facilityId, facilityId))).sort((left, right) => facilityPath(left.facilityId).localeCompare(facilityPath(right.facilityId)) || left.title.localeCompare(right.title));
    const rangeDates = eachDayOfInterval({ start: new Date(`${reportStartDate}T12:00:00`), end: new Date(`${reportEndDate}T12:00:00`) });
    const todosByFacility = new Map<string, typeof selectedTodos>();
    const relevantFacilityIds = new Set<string>();
    for (const todo of selectedTodos) {
      const facilityTodos = todosByFacility.get(todo.facilityId) ?? [];
      facilityTodos.push(todo);
      todosByFacility.set(todo.facilityId, facilityTodos);
      let current = facilityById.get(todo.facilityId);
      while (current) {
        relevantFacilityIds.add(current.id);
        current = current.parentId ? facilityById.get(current.parentId) : undefined;
      }
    }
    const relevantFacilities = (data?.facilities ?? []).filter((facility) => relevantFacilityIds.has(facility.id));
    const childrenByParent = new Map<string, typeof relevantFacilities>();
    for (const facility of relevantFacilities) {
      const parentKey = facility.parentId && relevantFacilityIds.has(facility.parentId) ? facility.parentId : '';
      const children = childrenByParent.get(parentKey) ?? [];
      children.push(facility);
      childrenByParent.set(parentKey, children);
    }
    for (const children of childrenByParent.values()) {
      children.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    }
    let itemNumber = 0;
    const renderTodo = (todo: (typeof selectedTodos)[number]) => {
      const applicableDates = todo.frequency === 'Custom' ? rangeDates.filter((date) => todo.customDays.includes(isoWeekday(date))) : rangeDates;
      const requiredPeriods = new Set(applicableDates.map((date) => reportPeriodKey(todo.frequency, date)));
      const completedPeriods = new Set([...latestActivity.values()].filter((entry) => entry.todoId === todo.id && entry.newStatus === 'Completed' && entry.workDate >= reportStartDate && entry.workDate <= reportEndDate).map((entry) => reportPeriodKey(todo.frequency, new Date(`${entry.workDate}T12:00:00`))).filter((key) => requiredPeriods.has(key)));
      const accomplished = Math.min(completedPeriods.size, requiredPeriods.size);
      const compliance = requiredPeriods.size ? Math.round(accomplished / requiredPeriods.size * 100) : 0;
      itemNumber += 1;
      return `<tr class="todo-row"><td>${itemNumber}</td><td>${escapeHtml(facilityById.get(todo.facilityId)?.name ?? 'Other Facility')}</td><td>${escapeHtml(todo.title)}</td><td>${escapeHtml(todo.category)}</td><td>${escapeHtml(todo.frequency)}</td><td>${escapeHtml(todo.priority)}</td><td>${requiredPeriods.size}</td><td>${accomplished}</td><td>${compliance}%</td></tr>`;
    };
    const renderFacility = (facility: (typeof relevantFacilities)[number], depth: number): string => {
      const directTodos = (todosByFacility.get(facility.id) ?? []).sort((left, right) => left.title.localeCompare(right.title));
      const children = childrenByParent.get(facility.id) ?? [];
      const safeDepth = Math.min(depth, 4);
      return `<tr class="facility-row facility-level-${safeDepth}"><td colspan="9"><span class="facility-name" style="padding-left:${safeDepth * 18}px">${depth ? '↳ ' : ''}${escapeHtml(facility.name)}</span></td></tr>${directTodos.map(renderTodo).join('')}${children.map((child) => renderFacility(child, depth + 1)).join('')}`;
    };
    const hierarchyRows = (childrenByParent.get('') ?? []).map((facility) => renderFacility(facility, 0)).join('');
    return `<table><thead><tr><th>No.</th><th>Facility</th><th>Maintenance To-do</th><th>Category</th><th>Frequency</th><th>Priority</th><th>Required Checks</th><th>Accomplished</th><th>Compliance</th></tr></thead><tbody>${hierarchyRows}</tbody></table>`;
  }

  function reportFormTables() {
    const selectedTodos = (data?.todos ?? [])
      .filter((todo) => [...reportFacilityIds].some((facilityId) => isWithinFacility(todo.facilityId, facilityId)))
      .sort((left, right) => facilityPath(left.facilityId).localeCompare(facilityPath(right.facilityId)) || left.title.localeCompare(right.title));
    const firstDate = new Date(`${reportStartDate}T12:00:00`);
    const lastDate = new Date(`${reportEndDate}T12:00:00`);
    const firstMonday = startOfWeek(firstDate, { weekStartsOn: 1 });
    const weeks: Date[] = [];
    for (let monday = firstMonday; monday <= lastDate; monday = addWeeks(monday, 1)) weeks.push(monday);
    const todosByFacility = new Map<string, typeof selectedTodos>();
    const relevantFacilityIds = new Set<string>();
    for (const todo of selectedTodos) {
      todosByFacility.set(todo.facilityId, [...(todosByFacility.get(todo.facilityId) ?? []), todo]);
      let current = facilityById.get(todo.facilityId);
      while (current) { relevantFacilityIds.add(current.id); current = current.parentId ? facilityById.get(current.parentId) : undefined; }
    }
    const relevantFacilities = (data?.facilities ?? []).filter((facility) => relevantFacilityIds.has(facility.id));
    const childrenByParent = new Map<string, typeof relevantFacilities>();
    for (const facility of relevantFacilities) {
      const parentKey = facility.parentId && relevantFacilityIds.has(facility.parentId) ? facility.parentId : '';
      childrenByParent.set(parentKey, [...(childrenByParent.get(parentKey) ?? []), facility]);
    }
    for (const children of childrenByParent.values()) children.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
    return weeks.map((monday, weekIndex) => {
      const weekDates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
      const weekLabel = `${format(weekDates[0], 'MMMM d, yyyy')} – ${format(weekDates[6], 'MMMM d, yyyy')}`;
      let itemNumber = 0;
      const renderTodo = (todo: (typeof selectedTodos)[number]) => {
        const dayCells = weekDates.map((date) => {
          const dateKey = format(date, 'yyyy-MM-dd');
          const outsidePeriod = dateKey < reportStartDate || dateKey > reportEndDate;
          const unscheduled = todo.frequency === 'Custom' && !todo.customDays.includes(isoWeekday(date));
          return outsidePeriod || unscheduled ? '<td class="not-applicable">—</td>' : '<td class="check-cell"><span class="check-box"></span></td>';
        }).join('');
        itemNumber += 1;
        return `<tr class="todo-row"><td>${itemNumber}</td><td></td><td><strong>${escapeHtml(todo.title)}</strong><div class="task-meta">${escapeHtml(todo.category)} · ${escapeHtml(todo.frequency)} · ${escapeHtml(todo.priority)}</div></td>${dayCells}<td class="remarks"></td></tr>`;
      };
      const renderFacility = (facility: (typeof relevantFacilities)[number], depth: number): string => {
        const directTodos = (todosByFacility.get(facility.id) ?? []).sort((left, right) => left.title.localeCompare(right.title));
        const children = childrenByParent.get(facility.id) ?? [];
        const safeDepth = Math.min(depth, 4);
        return `<tr class="form-facility-row form-facility-level-${safeDepth}"><td colspan="11"><span style="padding-left:${safeDepth * 18}px">${depth ? '↳ ' : ''}${escapeHtml(facility.name)}</span></td></tr>${directTodos.map(renderTodo).join('')}${children.map((child) => renderFacility(child, depth + 1)).join('')}`;
      };
      const rows = (childrenByParent.get('') ?? []).map((facility) => renderFacility(facility, 0)).join('');
      const dayHeaders = weekDates.map((date) => `<th class="day-column">${format(date, 'EEE').toUpperCase()}<br><span>${format(date, 'MMM d')}</span></th>`).join('');
      return `<section class="week-sheet${weekIndex ? ' next-week' : ''}"><div class="form-heading"><div><h1>Building and Facilities Maintenance — Weekly Form</h1><p>Week: ${escapeHtml(weekLabel)}</p></div><div class="form-fields">Assigned personnel: ____________________ &nbsp;&nbsp; Supervisor: ____________________</div></div><table><thead><tr><th class="number-column">No.</th><th class="facility-column">Facility</th><th>Maintenance To-do</th>${dayHeaders}<th class="remarks-column">Remarks</th></tr></thead><tbody>${rows || '<tr><td colspan="11" class="empty-form">No maintenance items selected.</td></tr>'}</tbody></table><div class="signatures"><span>Prepared by: ______________________________</span><span>Checked by: ______________________________</span><span>Date: __________________</span></div></section>`;
    }).join('');
  }

  function processReport() {
    if (!reportFacilityIds.size) return;
    const selectedNames = reportFacilityGroups.flatMap((group) => group.options).filter((facility) => reportFacilityIds.has(facility.id)).map((facility) => facility.name).join(', ');
    const periodLabel = `${format(new Date(`${reportStartDate}T12:00:00`), 'MMMM d, yyyy')} – ${format(new Date(`${reportEndDate}T12:00:00`), 'MMMM d, yyyy')}`;
    if (reportAction === 'form') {
      const printWindow = window.open('', '_blank', 'width=1400,height=900');
      if (!printWindow) return;
      printWindow.document.write(`<!doctype html><html><head><title>Weekly Building and Facilities Maintenance Form</title><style>@page{size:landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:9px}.week-sheet{width:100%}.next-week{break-before:page;page-break-before:always}.form-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:8px}.form-heading h1{font-size:17px;margin:0 0 3px}.form-heading p{font-size:11px;margin:0}.form-fields{font-size:10px;white-space:nowrap}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{border:1px solid #777;padding:4px;vertical-align:middle}th{background:#dfeee5;text-align:center}.number-column{width:28px}.facility-column{width:145px}.day-column{width:62px}.day-column span{font-weight:400}.remarks-column{width:105px}.form-facility-row td{background:#dcebe1;font-size:10px;font-weight:700;border-top:2px solid #72927c}.form-facility-level-1 td{background:#e8f2eb}.form-facility-level-2 td{background:#f0f6f2}.form-facility-level-3 td,.form-facility-level-4 td{background:#f7faf8}.task-meta{font-size:8px;color:#555;margin-top:2px}.check-cell{text-align:center;height:34px}.check-box{display:inline-block;width:16px;height:16px;border:1.5px solid #333}.not-applicable{text-align:center;background:#eee;color:#888}.remarks{height:34px}.empty-form{text-align:center;padding:24px}.signatures{display:flex;justify-content:space-between;gap:24px;margin-top:14px;font-size:10px}</style></head><body>${reportFormTables()}</body></html>`);
      printWindow.document.close(); printWindow.focus(); printWindow.print();
    } else if (reportAction === 'print') {
      const printWindow = window.open('', '_blank', 'width=1200,height=800');
      if (!printWindow) return;
      printWindow.document.write(`<!doctype html><html><head><title>Building and Facilities Maintenance</title><style>@page{size:landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:20px;margin:0 0 4px}.meta{font-size:11px;color:#555;margin-bottom:14px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #aaa;padding:5px;text-align:left;vertical-align:top}th{background:#e3f0e7}.todo-row:nth-of-type(even){background:#f7f7f7}.facility-row td{background:#dcebe1;font-size:10px;font-weight:700;border-top:2px solid #72927c}.facility-level-1 td{background:#e8f2eb}.facility-level-2 td{background:#f0f6f2}.facility-level-3 td,.facility-level-4 td{background:#f7faf8}.facility-name{display:inline-block}</style></head><body><h1>Building and Facilities Maintenance</h1><div class="meta">Period: ${escapeHtml(periodLabel)}<br>Facilities: ${escapeHtml(selectedNames)}</div>${reportTable()}</body></html>`);
      printWindow.document.close(); printWindow.focus(); printWindow.print();
    } else {
      const workbook = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:5px}th{background:#dfeee5}.facility-row td{background:#dcebe1;font-weight:bold}.facility-level-1 td{background:#e8f2eb}.facility-level-2 td{background:#f0f6f2}.facility-level-3 td,.facility-level-4 td{background:#f7faf8}</style></head><body><h2>Building and Facilities Maintenance</h2><p>Period: ${escapeHtml(periodLabel)}<br>Facilities: ${escapeHtml(selectedNames)}</p>${reportTable()}</body></html>`;
      const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel' }));
      const link = document.createElement('a'); link.href = url; link.download = `building-facilities-maintenance-${reportStartDate}-${reportEndDate}.xls`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setReportOpen(false);
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
          <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => openReport('print')}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => openReport('form')}><FileText className="h-4 w-4" /> Print Form</Button><Button variant="outline" onClick={() => openReport('excel')}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button><Button variant="outline" size="icon" onClick={() => setWeekStart((date) => addWeeks(date, -1))}><ArrowLeft className="h-4 w-4" /></Button><Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>This Week</Button><Button variant="outline" size="icon" onClick={() => setWeekStart((date) => addWeeks(date, 1))}><ArrowRight className="h-4 w-4" /></Button></div>
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
      open={reportOpen}
      onClose={() => setReportOpen(false)}
      title={reportAction === 'print' ? 'Print Maintenance Report' : reportAction === 'form' ? 'Print Weekly Maintenance Form' : 'Export Maintenance Report to Excel'}
      description="Choose the reporting period and one or more facility groups to include."
      size="md"
      footer={<><Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button><Button disabled={!reportFacilityIds.size} onClick={processReport}>{reportAction === 'excel' ? <><FileSpreadsheet className="h-4 w-4" /> Export Selected</> : reportAction === 'form' ? <><FileText className="h-4 w-4" /> Print Form</> : <><Printer className="h-4 w-4" /> Print Selected</>}</Button></>}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-3">
          <Label>Reporting Period</Label>
          <Select className="mt-1" value={reportPeriod} onChange={(event) => applyReportPeriod(event.target.value as ReportPeriod)}>
            <option value="year">This Year</option><option value="q1">Q1 — January to March</option><option value="q2">Q2 — April to June</option><option value="q3">Q3 — July to September</option><option value="q4">Q4 — October to December</option><option value="h1">January to June</option><option value="h2">July to December</option><option value="custom">Custom Date Range</option>
          </Select>
          {reportPeriod === 'custom' ? <div className="mt-3"><DateRangePicker label="Custom Date Range" startDate={reportStartDate} endDate={reportEndDate} onChange={(startDate, endDate) => { setReportStartDate(startDate); setReportEndDate(endDate); }} /></div> : <p className="mt-2 text-xs text-slate-500">{format(new Date(`${reportStartDate}T12:00:00`), 'MMMM d, yyyy')} – {format(new Date(`${reportEndDate}T12:00:00`), 'MMMM d, yyyy')}</p>}
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={allReportFacilityIds.length > 0 && reportFacilityIds.size === allReportFacilityIds.length} onChange={(event) => setReportFacilityIds(event.target.checked ? new Set(allReportFacilityIds) : new Set())} />
          All facilities
        </label>
        {reportFacilityGroups.map(({ root, options }) => <div key={root.id} className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-3"><p className="font-semibold">{root.name}</p><button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setReportFacilityIds((current) => { const next = new Set(current); const allSelected = options.every((facility) => next.has(facility.id)); options.forEach((facility) => allSelected ? next.delete(facility.id) : next.add(facility.id)); return next; })}>{options.every((facility) => reportFacilityIds.has(facility.id)) ? 'Clear group' : 'Select group'}</button></div>
          <div className="grid gap-2 sm:grid-cols-2">{options.map((facility) => <label key={facility.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={reportFacilityIds.has(facility.id)} onChange={() => setReportFacilityIds((current) => { const next = new Set(current); if (next.has(facility.id)) next.delete(facility.id); else next.add(facility.id); return next; })} /><span>{facility.name}</span><Badge>{countTodosWithin(facility.id)}</Badge></label>)}</div>
        </div>)}
      </div>
    </Dialog>
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
