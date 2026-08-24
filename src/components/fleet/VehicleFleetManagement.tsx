import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, Camera, Car, ClipboardCheck, ExternalLink, FileDown, FileSpreadsheet, Gauge, GripVertical, History, ImagePlus, List, Pencil, Plus, Printer, Trash2, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import benecoLogo from '@/assets/brand/beneco-logo.png';
import { VehicleModelViewer, type ModelAnnotation, type VehicleModelViewerHandle } from '@/components/fleet/VehicleModelViewer';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { deleteFleetVehicleModel, fetchFleetVehicleModel, fetchFleetVehicles, fetchOrgStructure, saveFleetVehicles, uploadFleetVehicleModel, type OrgDepartment } from '@/lib/api';

type FleetFile = { name: string; type: string; dataUrl: string };
type FleetModelFile = { name: string; type: string; size?: number; dataUrl?: string };
type CheckItem = { id: string; label: string; checked: boolean; notes: string; photos: FleetFile[] };
export type FleetChecklistTemplateItem = { id: string; label: string };
export type FleetInspectionEntry = { id: string; activity: string; status: string; findings: string; actionTaken: string; recommendation: string; notes: string; annotations?: ModelAnnotation[]; snapshot?: FleetFile; photos?: FleetFile[] };
export type FleetInspection = { id: string; date: string; inspectedBy: string; entries: FleetInspectionEntry[]; convertedTaskId?: string };
export type FleetScheduleRecurrence = { frequency: 'Annual'; month: number; startWeek: number; endWeek: number };
export type FleetSchedule = { id: string; type: 'Inspection' | 'Maintenance' | 'Preventive Maintenance' | 'Registration Renewal'; startDate: string; endDate: string; status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue'; recurrence?: FleetScheduleRecurrence; checklist: CheckItem[]; documents: FleetFile[] };
export type FleetVehicle = { id: string; type: string; brand: string; model: string; yearAcquired: string; plateNumber: string; propertyNumber: string; color: string; fuel: string; odometer: string; custodian: string; assignedDepartment?: string; assignedOffice: string; acquisitionCost: string; registrationExpiry: string; notes: string; image?: FleetFile; model3d?: FleetModelFile; preventiveChecklist?: FleetChecklistTemplateItem[]; inspectionStatuses?: string[]; inspections?: FleetInspection[]; schedules: FleetSchedule[] };
type Schedule = FleetSchedule;
type SummarySortKey = 'vehicle' | 'plate' | 'department' | 'type' | 'preventive' | 'registration';

export const FLEET_STORAGE_KEY = 'bes:vehicle-fleet:v1';
const today = new Date().toISOString().slice(0, 10);
const defaultChecks = ['Engine oil and fluid levels', 'Tires, wheels, and spare tire', 'Brakes and parking brake', 'Lights, signals, and horn', 'Battery and electrical system', 'Steering and suspension', 'Safety equipment and first-aid kit', 'Body, glass, and visible damage', 'Odometer and service interval'];
const inspectionActivities = ['General vehicle condition', ...defaultChecks, 'Roadworthiness and test drive', 'Other'];
const defaultInspectionStatuses = ['No Problem', 'For Replacement', 'Schedule Repair'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const newInspectionEntry = (): FleetInspectionEntry => ({ id: `INSP-ITEM-${Date.now()}-${Math.random().toString(36).slice(2)}`, activity: inspectionActivities[0], status: defaultInspectionStatuses[0], findings: '', actionTaken: '', recommendation: '', notes: '' });
const emptyInspection = { date: today, inspectedBy: '', entries: [newInspectionEntry()] };
const emptyVehicle = { type: 'Car', brand: '', model: '', yearAcquired: '', plateNumber: '', propertyNumber: '', color: '', fuel: 'Gasoline', odometer: '', custodian: '', assignedDepartment: 'ISD', assignedOffice: 'General Services Office', acquisitionCost: '', registrationExpiry: '', notes: '' };

export function loadFleetVehicles(): FleetVehicle[] {
  try { return JSON.parse(localStorage.getItem(FLEET_STORAGE_KEY) || '[]') as FleetVehicle[]; } catch { return []; }
}

function cacheFleetVehicles(vehicles: FleetVehicle[]) {
  const lightweightVehicles = vehicles.map((vehicle) => ({ ...vehicle, model3d: vehicle.model3d ? { name: vehicle.model3d.name, type: vehicle.model3d.type, size: vehicle.model3d.size } : undefined }));
  try {
    localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(lightweightVehicles));
  } catch (error) {
    console.warn('Unable to update the offline fleet cache.', error);
  }
}

function nextAnnualOccurrence(recurrence: FleetScheduleRecurrence) {
  const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const occurrenceForYear = (year: number) => {
    const lastDay = new Date(year, recurrence.month, 0).getDate();
    const startDay = Math.min((recurrence.startWeek - 1) * 7 + 1, lastDay);
    const endDay = Math.min(recurrence.endWeek * 7, lastDay);
    return { startDate: toIso(new Date(year, recurrence.month - 1, startDay)), endDate: toIso(new Date(year, recurrence.month - 1, endDay)) };
  };
  const currentYear = new Date().getFullYear();
  const current = occurrenceForYear(currentYear);
  return current.endDate >= today ? current : occurrenceForYear(currentYear + 1);
}

function nextVehicleSchedule(vehicle: FleetVehicle, type: FleetSchedule['type']) {
  return vehicle.schedules.filter((schedule) => schedule.type === type && schedule.status !== 'Completed').map((schedule) => schedule.recurrence ? { ...schedule, ...nextAnnualOccurrence(schedule.recurrence) } : schedule).filter((schedule) => schedule.endDate >= today).sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
}
function scheduleSummaryLabel(schedule?: FleetSchedule) {
  if (!schedule) return 'No schedule';
  const dates = schedule.startDate === schedule.endDate ? schedule.startDate : `${schedule.startDate} to ${schedule.endDate}`;
  return schedule.recurrence ? `${dates} · Annual (${monthNames[schedule.recurrence.month - 1]}, Week ${schedule.recurrence.startWeek}${schedule.recurrence.endWeek !== schedule.recurrence.startWeek ? `–${schedule.recurrence.endWeek}` : ''})` : dates;
}
function fleetSummaryRow(vehicle: FleetVehicle) {
  return { vehicle: `${vehicle.brand} ${vehicle.model}`, plate: vehicle.plateNumber, department: vehicle.assignedDepartment || 'Unassigned', type: vehicle.type || 'Other', preventive: scheduleSummaryLabel(nextVehicleSchedule(vehicle, 'Preventive Maintenance')), registration: scheduleSummaryLabel(nextVehicleSchedule(vehicle, 'Registration Renewal')) };
}
function escapePrintText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
}
async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url); const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

function readFiles(files: FileList | null): Promise<FleetFile[]> {
  return Promise.all(Array.from(files ?? []).map((file) => new Promise<FleetFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: String(reader.result) });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  })));
}

export function VehicleFleetManagement() {
  const { departments, createTaskFromCalendarEvent } = useData();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orgDepartments, setOrgDepartments] = useState<OrgDepartment[]>([]);
  const [oracleReady, setOracleReady] = useState(false);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(loadFleetVehicles);
  const lastLocalMutationRef = useRef(0);
  const applyingServerUpdateRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleDeleteOpen, setVehicleDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarySort, setSummarySort] = useState<{ key: SummarySortKey; direction: 'asc' | 'desc' }>({ key: 'vehicle', direction: 'asc' });
  const [registryFilterMode, setRegistryFilterMode] = useState<'all' | 'department' | 'type'>('all');
  const [registryFilterValue, setRegistryFilterValue] = useState('');
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionHistoryOpen, setInspectionHistoryOpen] = useState(false);
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null);
  const [inspectionForm, setInspectionForm] = useState(emptyInspection);
  const [inspectionStatuses, setInspectionStatuses] = useState<string[]>(defaultInspectionStatuses);
  const [activeInspectionEntryId, setActiveInspectionEntryId] = useState('');
  const modelViewerRef = useRef<VehicleModelViewerHandle>(null);
  const [convertingInspection, setConvertingInspection] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<FleetChecklistTemplateItem[]>([]);
  const [draggedCheckId, setDraggedCheckId] = useState('');
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [vehicleImage, setVehicleImage] = useState<FleetFile>();
  const [vehicleModel3d, setVehicleModel3d] = useState<FleetModelFile>();
  const [vehicleModel3dFile, setVehicleModel3dFile] = useState<File>();
  const [selectedModelUrl, setSelectedModelUrl] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ type: 'Preventive Maintenance' as FleetSchedule['type'], startDate: today, endDate: today, recurrenceMode: 'specific' as 'specific' | 'annual', recurrenceMonth: 10, startWeek: 1, endWeek: 2 });
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId);
  const schedules = vehicles.flatMap((vehicle) => vehicle.schedules);
  const completed = schedules.filter((schedule) => schedule.status === 'Completed').length;
  const due = schedules.filter((schedule) => schedule.status !== 'Completed' && schedule.endDate >= today).length;
  const overdue = schedules.filter((schedule) => schedule.status !== 'Completed' && schedule.endDate < today).length;
  const compliance = schedules.length ? Math.round((completed / schedules.length) * 100) : 0;
  const activitySummary = useMemo(() => {
    const scheduleSummary = (type: FleetSchedule['type']) => {
      const matching = selected?.schedules.filter((schedule) => schedule.type === type) ?? [];
      const last = matching.filter((schedule) => schedule.status === 'Completed').sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
      const next = matching.filter((schedule) => schedule.status !== 'Completed').map((schedule) => schedule.recurrence ? { ...schedule, ...nextAnnualOccurrence(schedule.recurrence) } : schedule).filter((schedule) => schedule.startDate >= today).sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
      return { last: last?.endDate, next: next?.startDate };
    };
    const inspectionDates = [
      ...(selected?.inspections ?? []).map((inspection) => inspection.date),
      ...(selected?.schedules.filter((schedule) => schedule.type === 'Inspection' && schedule.status === 'Completed').map((schedule) => schedule.endDate) ?? []),
    ].sort((left, right) => right.localeCompare(left));
    return { preventive: scheduleSummary('Preventive Maintenance'), registration: scheduleSummary('Registration Renewal'), inspection: inspectionDates[0] };
  }, [selected]);
  const linkedInspectionTaskId = editingInspectionId ? (selected?.inspections ?? []).find((inspection) => inspection.id === editingInspectionId)?.convertedTaskId : undefined;
  const assignmentDepartments = useMemo(() => orgDepartments.length
    ? orgDepartments.map((department) => ({ id: department.code, name: department.name, shortName: department.code, units: department.offices.map((office) => office.name) }))
    : departments.map((department) => ({ id: department.id, name: department.name, shortName: department.shortName, units: department.units })), [departments, orgDepartments]);
  const registryDepartments = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.assignedDepartment || 'Unassigned'))].sort(), [vehicles]);
  const registryVehicleTypes = useMemo(() => [...new Set(vehicles.map((vehicle) => vehicle.type || 'Other'))].sort(), [vehicles]);
  const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => registryFilterMode === 'all'
    || (registryFilterMode === 'department' ? (vehicle.assignedDepartment || 'Unassigned') === registryFilterValue : (vehicle.type || 'Other') === registryFilterValue)), [vehicles, registryFilterMode, registryFilterValue]);
  const summaryVehicles = useMemo(() => [...vehicles].sort((left, right) => {
    const leftValue = fleetSummaryRow(left)[summarySort.key];
    const rightValue = fleetSummaryRow(right)[summarySort.key];
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    return summarySort.direction === 'asc' ? comparison : -comparison;
  }), [vehicles, summarySort]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchOrgStructure(token).then((result) => { if (!cancelled) setOrgDepartments(result); }).catch(() => { /* keep the offline fallback */ });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setSelectedModelUrl(selected?.model3d?.dataUrl || '');
    if (!token || !selected?.model3d || selected.model3d.dataUrl) return;
    fetchFleetVehicleModel(token, selected.id).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSelectedModelUrl(objectUrl);
    }).catch((error) => console.warn('Unable to load the vehicle 3D model.', error));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected?.id, selected?.model3d?.name, token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchFleetVehicles<FleetVehicle[]>(token)
      .then((serverVehicles) => {
        if (cancelled) return;
        if (serverVehicles.length > 0) {
          setVehicles(serverVehicles);
          cacheFleetVehicles(serverVehicles);
        }
        setOracleReady(true);
      })
      .catch((error) => console.warn('Unable to load Oracle fleet data; keeping the local copy.', error));
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !oracleReady) return;
    if (applyingServerUpdateRef.current) { applyingServerUpdateRef.current = false; return; }
    const timer = window.setTimeout(() => {
      void saveFleetVehicles(token, vehicles).catch((error) => {
        console.warn('Unable to save fleet data to Oracle.', error);
        toast({ kind: 'error', title: 'Fleet changes were not saved', description: error instanceof Error ? error.message : 'Unable to save vehicle records to Oracle.' });
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [oracleReady, token, toast, vehicles]);

  useEffect(() => {
    if (!token || !oracleReady) return;
    let cancelled = false;
    const refreshFromServer = async () => {
      if (Date.now() - lastLocalMutationRef.current < 2500) return;
      try {
        const serverVehicles = await fetchFleetVehicles<FleetVehicle[]>(token);
        if (cancelled) return;
        applyingServerUpdateRef.current = true;
        setVehicles(serverVehicles);
        cacheFleetVehicles(serverVehicles);
      } catch (error) {
        console.warn('Unable to synchronize fleet vehicles.', error);
      }
    };
    const onFocus = () => void refreshFromServer();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refreshFromServer(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => void refreshFromServer(), 10_000);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); window.clearInterval(interval); };
  }, [oracleReady, token]);

  function persist(next: FleetVehicle[]) { lastLocalMutationRef.current = Date.now(); setVehicles(next); cacheFleetVehicles(next); }
  function updateVehicle(id: string, fn: (vehicle: FleetVehicle) => FleetVehicle) { persist(vehicles.map((vehicle) => vehicle.id === id ? fn(vehicle) : vehicle)); }
  async function saveVehicle() {
    if (!vehicleForm.brand.trim() || !vehicleForm.model.trim() || !vehicleForm.plateNumber.trim()) return;
    const vehicleId = editingVehicleId || `VEH-${Date.now()}`;
    setSavingVehicle(true);
    try {
      let model = vehicleModel3d;
      if (vehicleModel3dFile) {
        if (!token) throw new Error('Your session has expired. Please sign in and try again.');
        model = await uploadFleetVehicleModel(token, vehicleId, vehicleModel3dFile);
      } else if (editingVehicleId && !vehicleModel3d && vehicles.find((vehicle) => vehicle.id === editingVehicleId)?.model3d && token) {
        await deleteFleetVehicleModel(token, editingVehicleId);
      }
      if (editingVehicleId) updateVehicle(editingVehicleId, (vehicle) => ({ ...vehicle, ...vehicleForm, image: vehicleImage ?? vehicle.image, model3d: model }));
      else {
        const vehicle: FleetVehicle = { ...vehicleForm, id: vehicleId, image: vehicleImage, model3d: model, schedules: [] };
        persist([...vehicles, vehicle]); setSelectedId(vehicle.id);
      }
      setVehicleOpen(false); setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined); setVehicleModel3d(undefined); setVehicleModel3dFile(undefined);
    } catch (error) {
      toast({ kind: 'error', title: 'Vehicle was not saved', description: error instanceof Error ? error.message : 'Unable to save the vehicle.' });
    } finally {
      setSavingVehicle(false);
    }
  }
  function openAddVehicle() {
    setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined); setVehicleModel3d(undefined); setVehicleModel3dFile(undefined); setVehicleOpen(true);
  }
  function openEditVehicle(vehicle: FleetVehicle) {
    setSelectedId(vehicle.id); setEditingVehicleId(vehicle.id);
    setVehicleForm({
      type: vehicle.type, brand: vehicle.brand, model: vehicle.model, yearAcquired: vehicle.yearAcquired,
      plateNumber: vehicle.plateNumber, propertyNumber: vehicle.propertyNumber, color: vehicle.color,
      fuel: vehicle.fuel, odometer: vehicle.odometer, custodian: vehicle.custodian,
      assignedDepartment: vehicle.assignedDepartment ?? 'ISD', assignedOffice: vehicle.assignedOffice,
      acquisitionCost: vehicle.acquisitionCost, registrationExpiry: vehicle.registrationExpiry, notes: vehicle.notes,
    });
    setVehicleImage(vehicle.image); setVehicleModel3d(vehicle.model3d); setVehicleModel3dFile(undefined); setVehicleOpen(true);
  }
  function deleteVehicle() {
    if (!editingVehicleId) return;
    const next = vehicles.filter((vehicle) => vehicle.id !== editingVehicleId);
    persist(next); setSelectedId(next[0]?.id ?? ''); setVehicleDeleteOpen(false); setVehicleOpen(false);
    setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined); setVehicleModel3d(undefined);
  }
  function addSchedule() {
    if (!selected || !scheduleForm.startDate || !scheduleForm.endDate) return;
    const recurrence = scheduleForm.type === 'Registration Renewal' && scheduleForm.recurrenceMode === 'annual'
      ? { frequency: 'Annual' as const, month: scheduleForm.recurrenceMonth, startWeek: scheduleForm.startWeek, endWeek: scheduleForm.endWeek }
      : undefined;
    const occurrence = recurrence ? nextAnnualOccurrence(recurrence) : { startDate: scheduleForm.startDate, endDate: scheduleForm.endDate };
    if (editingScheduleId) {
      updateVehicle(selected.id, (vehicle) => ({ ...vehicle, schedules: vehicle.schedules.map((schedule) => schedule.id === editingScheduleId ? { ...schedule, type: scheduleForm.type, ...occurrence, recurrence } : schedule) }));
      setScheduleOpen(false); setEditingScheduleId(null); return;
    }
    const template = scheduleForm.type === 'Preventive Maintenance' && selected.preventiveChecklist?.length
      ? selected.preventiveChecklist.map((item) => item.label)
      : defaultChecks;
    const schedule: FleetSchedule = { id: `SCH-${Date.now()}`, type: scheduleForm.type, ...occurrence, recurrence, status: 'Scheduled', documents: [], checklist: template.map((label, index) => ({ id: `CHK-${Date.now()}-${index}`, label, checked: false, notes: '', photos: [] })) };
    updateVehicle(selected.id, (vehicle) => ({ ...vehicle, schedules: [...vehicle.schedules, schedule] })); setScheduleOpen(false);
  }
  function openNewSchedule(type: FleetSchedule['type'] = 'Preventive Maintenance') {
    setEditingScheduleId(null);
    setScheduleForm((current) => ({ ...current, type, startDate: today, endDate: today, recurrenceMode: 'specific' }));
    setScheduleOpen(true);
  }
  function openScheduleForType(type: FleetSchedule['type']) {
    if (!selected) return;
    const schedule = nextVehicleSchedule(selected, type) ?? [...selected.schedules].filter((item) => item.type === type).sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    if (!schedule) { openNewSchedule(type); return; }
    setEditingScheduleId(schedule.id);
    setScheduleForm({ type: schedule.type, startDate: schedule.startDate, endDate: schedule.endDate, recurrenceMode: schedule.recurrence ? 'annual' : 'specific', recurrenceMonth: schedule.recurrence?.month ?? 10, startWeek: schedule.recurrence?.startWeek ?? 1, endWeek: schedule.recurrence?.endWeek ?? 2 });
    setScheduleOpen(true);
  }
  function openChecklist() {
    if (!selected) return;
    setChecklistDraft(selected.preventiveChecklist?.length ? selected.preventiveChecklist.map((item) => ({ ...item })) : defaultChecks.map((label, index) => ({ id: `TPL-${Date.now()}-${index}`, label })));
    setChecklistOpen(true);
  }
  function openInspection() {
    setEditingInspectionId(null);
    const entry = newInspectionEntry(); setInspectionForm({ date: today, inspectedBy: user?.name ?? '', entries: [entry] }); setActiveInspectionEntryId(entry.id);
    setInspectionStatuses(selected?.inspectionStatuses?.length ? selected.inspectionStatuses : defaultInspectionStatuses);
    setInspectionOpen(true);
  }
  function saveInspection() {
    if (!selected || !inspectionForm.entries.length || !inspectionForm.date || !inspectionForm.inspectedBy.trim()) return;
    const inspection: FleetInspection = { id: editingInspectionId ?? `INSP-${Date.now()}`, ...inspectionForm };
    updateVehicle(selected.id, (vehicle) => ({ ...vehicle, inspectionStatuses, inspections: editingInspectionId
      ? (vehicle.inspections ?? []).map((item) => item.id === editingInspectionId ? inspection : item)
      : [...(vehicle.inspections ?? []), inspection] }));
    setInspectionOpen(false);
    setEditingInspectionId(null);
  }
  function editInspection(inspection: FleetInspection) {
    setEditingInspectionId(inspection.id);
    const entries = getInspectionEntries(inspection).map((entry) => ({ ...entry })); setInspectionForm({ date: inspection.date, inspectedBy: inspection.inspectedBy, entries }); setActiveInspectionEntryId(entries[0]?.id ?? '');
    setInspectionStatuses(selected?.inspectionStatuses?.length ? selected.inspectionStatuses : defaultInspectionStatuses);
    setInspectionHistoryOpen(false);
    setInspectionOpen(true);
  }
  function updateInspectionEntry(id: string, patch: Partial<FleetInspectionEntry>) {
    setInspectionForm((current) => ({ ...current, entries: current.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) }));
  }
  async function captureInspectionSnapshot(entryId: string) {
    setActiveInspectionEntryId(entryId);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const dataUrl = await modelViewerRef.current?.captureSnapshot();
      if (dataUrl) updateInspectionEntry(entryId, { snapshot: { name: `vehicle-inspection-${inspectionForm.date}.png`, type: 'image/png', dataUrl } });
    } catch (error) { toast({ kind: 'error', title: 'Unable to capture snapshot', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }
  async function attachInspectionPhotos(entryId: string, files: FileList | null) {
    const photos = await readFiles(files);
    if (photos.length) updateInspectionEntry(entryId, { photos: [...(inspectionForm.entries.find((entry) => entry.id === entryId)?.photos ?? []), ...photos] });
  }
  function printInspectionReport() {
    if (!selected) return;
    const reportWindow = window.open('', '_blank', 'width=1000,height=800'); if (!reportWindow) return; reportWindow.opener = null;
    const entries = inspectionForm.entries.map((entry, index) => `<section><h2>${index + 1}. ${escapePrintText(entry.activity)} <span>${escapePrintText(entry.status)}</span></h2><div class="grid"><div><b>Findings</b><p>${escapePrintText(entry.findings || '—')}</p></div><div><b>Action Taken</b><p>${escapePrintText(entry.actionTaken || '—')}</p></div><div><b>Recommendation</b><p>${escapePrintText(entry.recommendation || '—')}</p></div><div><b>Notes</b><p>${escapePrintText(entry.notes || '—')}</p></div></div>${entry.snapshot ? `<h3>3D Inspection Snapshot</h3><img src="${entry.snapshot.dataUrl}">` : ''}${(entry.photos ?? []).length ? `<h3>Photo Evidence</h3><div class="photos">${(entry.photos ?? []).map((photo) => `<img src="${photo.dataUrl}">`).join('')}</div>` : ''}</section>`).join('');
    reportWindow.document.write(`<!doctype html><html><head><title>Vehicle Inspection Report - ${escapePrintText(selected.plateNumber)}</title><style>body{font:12px Arial,sans-serif;color:#111;padding:28px}.header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #166534;padding-bottom:12px}.logo{width:60px;height:60px;object-fit:contain}h1{font-size:20px;margin:0}.meta{margin:16px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px}section{border-top:1px solid #999;padding-top:12px;margin-top:16px;break-inside:avoid}h2{font-size:15px}h2 span{float:right;border:1px solid #999;border-radius:12px;padding:3px 8px;font-size:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid div{border:1px solid #ccc;padding:8px}.grid p{white-space:pre-wrap;margin:5px 0}h3{font-size:12px;margin-bottom:6px}img{max-width:360px;max-height:230px;object-fit:contain;border:1px solid #ccc}.photos{display:flex;flex-wrap:wrap;gap:8px}.photos img{width:180px;height:130px;object-fit:cover}@media print{body{padding:0}}</style></head><body><div class="header"><img class="logo" src="${benecoLogo}"><div><h1>Vehicle Inspection Report</h1><div>Benguet Electric Cooperative</div></div></div><div class="meta"><div><b>Vehicle:</b> ${escapePrintText(`${selected.brand} ${selected.model}`)}</div><div><b>Plate No.:</b> ${escapePrintText(selected.plateNumber)}</div><div><b>Inspection Date:</b> ${escapePrintText(inspectionForm.date)}</div><div><b>Inspected By:</b> ${escapePrintText(inspectionForm.inspectedBy)}</div></div>${entries}<script>window.onload=()=>window.print()<\/script></body></html>`); reportWindow.document.close();
  }
  async function exportInspectionPdf() {
    if (!selected) return;
    const { jsPDF } = await import('jspdf'); const pdf = new jsPDF({ unit: 'mm', format: 'a4' }); let y = 14;
    const logoData = await imageUrlToDataUrl(benecoLogo); pdf.addImage(logoData, 'PNG', 14, y, 18, 18); pdf.setFontSize(17); pdf.text('Vehicle Inspection Report', 37, y + 7); pdf.setFontSize(10); pdf.text('Benguet Electric Cooperative', 37, y + 13); y += 25;
    pdf.setFontSize(10); pdf.text(`Vehicle: ${selected.brand} ${selected.model} (${selected.plateNumber})`, 14, y); y += 5; pdf.text(`Inspection Date: ${inspectionForm.date}    Inspected By: ${inspectionForm.inspectedBy}`, 14, y); y += 8;
    const ensure = (needed: number) => { if (y + needed > 282) { pdf.addPage(); y = 14; } };
    for (const [index, entry] of inspectionForm.entries.entries()) {
      ensure(35); pdf.setDrawColor(180); pdf.line(14, y, 196, y); y += 6; pdf.setFontSize(12); pdf.text(`${index + 1}. ${entry.activity}`, 14, y); pdf.setFontSize(9); pdf.text(`Status: ${entry.status}`, 145, y); y += 6;
      for (const [label, value] of [['Findings', entry.findings], ['Action Taken', entry.actionTaken], ['Recommendation', entry.recommendation], ['Notes', entry.notes]]) { ensure(12); pdf.setFont('helvetica', 'bold'); pdf.text(`${label}:`, 14, y); pdf.setFont('helvetica', 'normal'); const lines = pdf.splitTextToSize(value || '—', 155); pdf.text(lines, 42, y); y += Math.max(lines.length * 4, 5); }
      for (const image of [entry.snapshot, ...(entry.photos ?? [])].filter(Boolean) as FleetFile[]) { ensure(55); const format = image.type.includes('png') ? 'PNG' : 'JPEG'; pdf.addImage(image.dataUrl, format, 14, y, 75, 48, undefined, 'FAST'); y += 53; }
    }
    pdf.save(`vehicle-inspection-${selected.plateNumber}-${inspectionForm.date}.pdf`);
  }
  function createInspectionStatus(entryId: string) {
    const status = window.prompt('Enter the new inspection status:')?.trim();
    if (!status) return;
    setInspectionStatuses((current) => current.some((item) => item.toLowerCase() === status.toLowerCase()) ? current : [...current, status]);
    updateInspectionEntry(entryId, { status });
  }
  async function addInspectionToTasks() {
    if (!selected || !user || !editingInspectionId) return;
    const existing = (selected.inspections ?? []).find((inspection) => inspection.id === editingInspectionId);
    if (existing?.convertedTaskId) {
      setInspectionOpen(false);
      navigate(`/my-work/${encodeURIComponent(existing.convertedTaskId)}`);
      return;
    }
    const issues = inspectionForm.entries.filter((entry) => entry.status.trim().toLowerCase() !== 'no problem');
    if (!issues.length) {
      toast({ kind: 'error', title: 'No follow-up items', description: 'All inspected vehicle parts are marked No Problem.' });
      return;
    }
    setConvertingInspection(true);
    try {
      const description = [
        `Vehicle inspection follow-up for ${selected.brand} ${selected.model} (${selected.plateNumber}).`,
        `Inspection date: ${inspectionForm.date}`,
        `Inspected by: ${inspectionForm.inspectedBy}`,
        ...issues.map((entry, index) => [
          `${index + 1}. ${entry.activity} — ${entry.status}`,
          entry.findings && `Findings: ${entry.findings}`,
          entry.actionTaken && `Action Taken: ${entry.actionTaken}`,
          entry.recommendation && `Recommendation: ${entry.recommendation}`,
          entry.notes && `Notes: ${entry.notes}`,
        ].filter(Boolean).join('\n')),
      ].join('\n\n');
      const result = await createTaskFromCalendarEvent({
        calendarEventId: '',
        title: `Vehicle inspection follow-up: ${selected.plateNumber}`,
        description,
        assigneeUsername: user.username,
        departmentId: selected.assignedDepartment ?? user.departmentCode ?? 'ISD',
        officeAssignment: selected.assignedOffice || user.unitName || 'General Services Office',
        taskSubject: 'Vehicle Fleet Management System',
        priority: issues.some((entry) => entry.status.toLowerCase().includes('replacement')) ? 'High' : 'Normal',
      });
      if (!result.ok) throw new Error(result.error);
      const inspection: FleetInspection = { id: editingInspectionId, ...inspectionForm, convertedTaskId: result.task.id };
      updateVehicle(selected.id, (vehicle) => ({ ...vehicle, inspectionStatuses, inspections: (vehicle.inspections ?? []).map((item) => item.id === editingInspectionId ? inspection : item) }));
      setInspectionOpen(false);
      setEditingInspectionId(null);
      toast({ kind: 'success', title: 'Inspection added to Tasks', description: `${result.task.id} includes ${issues.length} follow-up ${issues.length === 1 ? 'item' : 'items'}.` });
      navigate(`/my-work/${encodeURIComponent(result.task.id)}`);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to create task', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setConvertingInspection(false);
    }
  }
  function saveChecklist() {
    if (!selected) return;
    const checklist = checklistDraft.map((item) => ({ ...item, label: item.label.trim() })).filter((item) => item.label);
    updateVehicle(selected.id, (vehicle) => ({ ...vehicle, preventiveChecklist: checklist }));
    setChecklistOpen(false);
  }
  function moveChecklistItem(targetId: string) {
    if (!draggedCheckId || draggedCheckId === targetId) return;
    setChecklistDraft((current) => {
      const from = current.findIndex((item) => item.id === draggedCheckId);
      const to = current.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }
  function printChecklist() {
    if (!selected) return;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
    const rows = checklistDraft.filter((item) => item.label.trim()).map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.label)}</td><td class="check">&#9633;</td><td></td></tr>`).join('');
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>Preventive Maintenance Checklist</title><style>body{font:14px Arial,sans-serif;color:#111;padding:32px}.header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #166534;padding-bottom:14px;margin-bottom:18px}.logo{width:64px;height:64px;object-fit:contain}.organization{font-size:18px;font-weight:700;color:#14532d}.system{margin-top:3px;font-size:12px;color:#555}h1{font-size:20px;margin:0 0 6px}.meta{margin:0 0 24px;color:#444}.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}.line{border-bottom:1px solid #333;height:22px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #333;padding:8px;text-align:left}th{background:#eee}.check{width:55px;text-align:center;font-size:20px}td:last-child{height:34px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:55px;text-align:center}.signature{border-top:1px solid #333;padding-top:6px}@media print{body{padding:0}}</style></head><body><div class="header"><img class="logo" src="${benecoLogo}" alt="BENECO logo"><div><div class="organization">Benguet Electric Cooperative</div><div class="system">BENECO Enterprise System</div></div></div><h1>Preventive Maintenance Checklist</h1><p class="meta">${escapeHtml(`${selected.brand} ${selected.model}`)} &middot; ${escapeHtml(selected.plateNumber)}</p><div class="fields"><div>Date:<div class="line"></div></div><div>Odometer:<div class="line"></div></div><div>Mechanic:<div class="line"></div></div><div>Work Order No.:<div class="line"></div></div></div><table><thead><tr><th>#</th><th>Maintenance activity</th><th>Done</th><th>Findings / action taken</th></tr></thead><tbody>${rows}</tbody></table><div class="signatures"><div class="signature">Performed by / Date</div><div class="signature">Verified by / Date</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }
  function printFleetSummary() {
    const rows = summaryVehicles.map((vehicle) => fleetSummaryRow(vehicle));
    const printWindow = window.open('', '_blank', 'width=1100,height=750');
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><html><head><title>Vehicle Fleet Schedule Summary</title><style>body{font:13px Arial,sans-serif;color:#111;padding:30px}.header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #166534;padding-bottom:12px;margin-bottom:20px}.logo{width:58px;height:58px;object-fit:contain}h1{font-size:20px;margin:0}.sub{margin-top:4px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:8px;text-align:left;vertical-align:top}th{background:#e8f3eb}.muted{color:#666}@media print{body{padding:0}}</style></head><body><div class="header"><img class="logo" src="${benecoLogo}" alt="BENECO logo"><div><h1>Vehicle Fleet Schedule Summary</h1><div class="sub">Benguet Electric Cooperative · Generated ${new Date().toLocaleDateString()}</div></div></div><table><thead><tr><th>No.</th><th>Vehicle</th><th>Plate No.</th><th>Department</th><th>Vehicle Type</th><th>Preventive Maintenance</th><th>Registration Renewal</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapePrintText(row.vehicle)}</td><td>${escapePrintText(row.plate)}</td><td>${escapePrintText(row.department)}</td><td>${escapePrintText(row.type)}</td><td>${escapePrintText(row.preventive)}</td><td>${escapePrintText(row.registration)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }
  function exportFleetSummary() {
    const rows = summaryVehicles.map((vehicle) => fleetSummaryRow(vehicle));
    const table = `<table><thead><tr><th>No.</th><th>Vehicle</th><th>Plate Number</th><th>Department</th><th>Vehicle Type</th><th>Preventive Maintenance Schedule</th><th>Registration Renewal Schedule</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapePrintText(row.vehicle)}</td><td>${escapePrintText(row.plate)}</td><td>${escapePrintText(row.department)}</td><td>${escapePrintText(row.type)}</td><td>${escapePrintText(row.preventive)}</td><td>${escapePrintText(row.registration)}</td></tr>`).join('')}</tbody></table>`;
    const blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${table}</body></html>`], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vehicle-fleet-schedule-summary-${today}.xls`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toggleSummarySort(key: SummarySortKey) {
    setSummarySort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  }
  async function setImage(event: ChangeEvent<HTMLInputElement>) { setVehicleImage((await readFiles(event.target.files))[0]); }
  async function setModel3d(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      toast({ kind: 'error', title: 'Unsupported 3D model', description: 'Please attach a GLB (.glb) file.' });
      event.target.value = '';
      return;
    }
    setVehicleModel3d({ name: file.name, type: file.type || 'model/gltf-binary', size: file.size });
    setVehicleModel3dFile(file);
  }

  const metricCards = useMemo(() => [
    { label: 'Fleet Size', value: vehicles.length, icon: Car, tone: 'text-brand-700 bg-brand-50' },
    { label: 'Due on Schedule', value: due, icon: CalendarRange, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Overdue', value: overdue, icon: Wrench, tone: 'text-red-700 bg-red-50' },
    { label: 'Schedule Compliance', value: `${compliance}%`, icon: Gauge, tone: 'text-emerald-700 bg-emerald-50' },
  ], [vehicles.length, due, overdue, compliance]);

  return <div className="space-y-5">
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => setSummaryOpen(true)}><List className="h-4 w-4" /> Summary View</Button><Button variant="outline" onClick={() => window.open('/workspace/vehicle-fleet/maintenance-schedule', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Maintenance Schedule <ExternalLink className="h-3.5 w-3.5" /></Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-3 p-4"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card className="min-h-[360px] p-4" onClick={() => setSelectedId('')}><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Vehicle Registry</h3><p className="text-xs text-slate-500">Click to select · double-click to edit</p></div><Button size="sm" onClick={(event) => { event.stopPropagation(); openAddVehicle(); }}><Plus className="h-4 w-4" /> Add</Button></div>
        <div className="mb-3 grid gap-2" onClick={(event) => event.stopPropagation()}><Select aria-label="Filter vehicle registry" value={registryFilterMode} onChange={(event) => { const mode = event.target.value as 'all' | 'department' | 'type'; setRegistryFilterMode(mode); setRegistryFilterValue(mode === 'department' ? registryDepartments[0] ?? '' : mode === 'type' ? registryVehicleTypes[0] ?? '' : ''); }}><option value="all">All Vehicles</option><option value="department">Department</option><option value="type">Vehicle Type</option></Select>{registryFilterMode !== 'all' && <Select aria-label={registryFilterMode === 'department' ? 'Select department' : 'Select vehicle type'} value={registryFilterValue} onChange={(event) => setRegistryFilterValue(event.target.value)}>{(registryFilterMode === 'department' ? registryDepartments : registryVehicleTypes).map((value) => <option key={value}>{registryFilterMode === 'department' ? assignmentDepartments.find((department) => department.id === value)?.name ?? value : value}</option>)}</Select>}</div>
        <div className="space-y-2">{vehicles.length === 0 ? <div className="rounded-lg border border-dashed p-7 text-center text-sm text-slate-500"><Car className="mx-auto mb-2 h-8 w-8 text-slate-300" />Add the first vehicle to begin.</div> : filteredVehicles.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No vehicles match this filter.</div> : filteredVehicles.map((vehicle) => <button key={vehicle.id} onClick={(event) => { event.stopPropagation(); setSelectedId(vehicle.id); }} onDoubleClick={(event) => { event.stopPropagation(); openEditVehicle(vehicle); }} className={`flex w-full gap-3 rounded-lg border p-3 text-left ${selected?.id === vehicle.id ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>{vehicle.image ? <img src={vehicle.image.dataUrl} className="h-12 w-16 rounded object-cover" /> : <span className="grid h-12 w-16 place-items-center rounded bg-slate-100"><Car className="h-5 w-5 text-slate-400" /></span>}<span className="min-w-0"><span className="block truncate text-sm font-semibold">{vehicle.brand} {vehicle.model}</span><span className="block text-xs text-slate-500">{vehicle.plateNumber} · {vehicle.type}</span><span className="block text-[11px] text-slate-400">Accountable: {vehicle.custodian || 'Unassigned'}</span></span></button>)}</div>
      </Card>
      <Card className="p-5">{!selected ? <div className="grid min-h-[360px] place-items-center text-center text-slate-500"><div><Car className="mx-auto mb-3 h-10 w-10 text-slate-300" /><p className="font-medium text-slate-700">Please select a vehicle</p><p className="mt-1 text-sm">Choose a vehicle from the registry to view its history and maintenance records.</p></div></div> : <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{selected.brand} {selected.model}</h3><Badge>{selected.plateNumber}</Badge><Button size="icon" variant="ghost" onClick={() => openEditVehicle(selected)} title="Edit vehicle details" aria-label={`Edit ${selected.brand} ${selected.model}`}><Pencil className="h-4 w-4" /></Button></div><p className="text-sm text-slate-500">{selected.type} · Acquired {selected.yearAcquired || '—'} · {selected.fuel} · {selected.odometer || '0'} km</p><p className="mt-1 text-xs text-slate-500">Accountable person: {selected.custodian || 'Unassigned'} · {assignmentDepartments.find((department) => department.id === selected.assignedDepartment)?.shortName ?? selected.assignedDepartment ?? 'ISD'} / {selected.assignedOffice || 'Department Level / No Office'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={openInspection}><History className="h-4 w-4" /> Inspection</Button><Button variant="outline" onClick={openChecklist}><ClipboardCheck className="h-4 w-4" /> Checklist</Button><Button onClick={() => setScheduleOpen(true)}><CalendarRange className="h-4 w-4" /> Add Schedule</Button></div></div>
        <div className="grid gap-2 sm:grid-cols-3"><Info label="Property No." value={selected.propertyNumber}/><Info label="Registration Expiry" value={selected.registrationExpiry}/><Info label="Color" value={selected.color}/></div>
        <div><h4 className="mb-2 flex items-center gap-2 font-semibold"><History className="h-4 w-4" /> Vehicle Activity History</h4><div className="divide-y overflow-hidden rounded-lg border border-slate-200">
          <ActivitySummaryRow title="Preventive Maintenance" fields={[['Last activity', activitySummary.preventive.last], ['Next schedule', activitySummary.preventive.next]]} onClick={() => openScheduleForType('Preventive Maintenance')} />
          <ActivitySummaryRow title="Registration Renewal" fields={[['Last activity', activitySummary.registration.last], ['Next schedule', activitySummary.registration.next]]} onClick={() => openScheduleForType('Registration Renewal')} />
          <ActivitySummaryRow title="Inspection" fields={[["Last date conducted", activitySummary.inspection]]} onClick={() => setInspectionHistoryOpen(true)} />
        </div></div>
      </div>}</Card>
    </div>
    <Dialog open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Vehicle Fleet Schedule Summary" description="All vehicles with their next preventive maintenance and registration renewal schedules." size="xl" footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Button variant="outline" onClick={printFleetSummary}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={exportFleetSummary}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button></div><Button onClick={() => setSummaryOpen(false)}>Close</Button></div>}>
      {vehicles.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">No vehicles registered.</div> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[960px] text-sm"><thead className="bg-slate-50"><tr><th className="w-12 px-3 py-2 text-left">No.</th><th className="px-3 py-2 text-left"><SummarySortButton label="Vehicle" sortKey="vehicle" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Plate No." sortKey="plate" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Department" sortKey="department" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Vehicle Type" sortKey="type" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Preventive Maintenance" sortKey="preventive" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Registration Renewal" sortKey="registration" sort={summarySort} onSort={toggleSummarySort} /></th></tr></thead><tbody className="divide-y divide-slate-100">{summaryVehicles.map((vehicle, index) => { const row = fleetSummaryRow(vehicle); return <tr key={vehicle.id}><td className="px-3 py-3 text-slate-500">{index + 1}</td><td className="px-3 py-3 font-medium">{row.vehicle}</td><td className="px-3 py-3">{row.plate}</td><td className="px-3 py-3">{assignmentDepartments.find((department) => department.id === row.department)?.name ?? row.department}</td><td className="px-3 py-3">{row.type}</td><td className="px-3 py-3 text-xs text-slate-600">{row.preventive}</td><td className="px-3 py-3 text-xs text-slate-600">{row.registration}</td></tr>; })}</tbody></table></div>}
    </Dialog>
    <Dialog open={vehicleOpen} onClose={() => { if (!savingVehicle) setVehicleOpen(false); }} title={editingVehicleId ? 'Edit Vehicle' : 'Add Vehicle'} description={editingVehicleId ? 'Update vehicle assignment, identity, registration, and operating details.' : 'Register a car, truck, motorcycle, or other fleet asset.'} size="lg" footer={<div className="flex w-full items-center justify-between gap-2">{editingVehicleId ? <Button variant="destructive" disabled={savingVehicle} onClick={() => setVehicleDeleteOpen(true)}>Delete Vehicle</Button> : <span />}<div className="flex gap-2"><Button variant="outline" disabled={savingVehicle} onClick={() => setVehicleOpen(false)}>Cancel</Button><Button disabled={savingVehicle || !vehicleForm.brand || !vehicleForm.model || !vehicleForm.plateNumber} onClick={() => void saveVehicle()}>{savingVehicle ? 'Saving…' : editingVehicleId ? 'Save Changes' : 'Save Vehicle'}</Button></div></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle Type"><Select value={vehicleForm.type} onChange={(e) => setVehicleForm({...vehicleForm,type:e.target.value})}>{['Car','Truck','Motorcycle','Van','Bus','Utility Vehicle','Heavy Equipment','Other'].map(v=><option key={v}>{v}</option>)}</Select></Field>
        <Field label="Plate Number" required><Input value={vehicleForm.plateNumber} onChange={(e)=>setVehicleForm({...vehicleForm,plateNumber:e.target.value})}/></Field>
        <Field label="Brand" required><Input value={vehicleForm.brand} onChange={(e)=>setVehicleForm({...vehicleForm,brand:e.target.value})}/></Field>
        <Field label="Model" required><Input value={vehicleForm.model} onChange={(e)=>setVehicleForm({...vehicleForm,model:e.target.value})}/></Field>
        <Field label="Year Acquired"><Input type="number" value={vehicleForm.yearAcquired} onChange={(e)=>setVehicleForm({...vehicleForm,yearAcquired:e.target.value})}/></Field>
        <Field label="Property Number"><Input value={vehicleForm.propertyNumber} onChange={(e)=>setVehicleForm({...vehicleForm,propertyNumber:e.target.value})}/></Field>
        <Field label="Accountable Person"><Input value={vehicleForm.custodian} onChange={(e)=>setVehicleForm({...vehicleForm,custodian:e.target.value})}/></Field>
        <Field label="Department Assigned"><Select value={vehicleForm.assignedDepartment} onChange={(e) => setVehicleForm({...vehicleForm,assignedDepartment:e.target.value,assignedOffice:''})}>{assignmentDepartments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</Select></Field>
        <Field label="Assigned Office"><Select value={vehicleForm.assignedOffice} onChange={(e)=>setVehicleForm({...vehicleForm,assignedOffice:e.target.value})}><option value="">Department Level / No Office</option>{vehicleForm.assignedOffice && !assignmentDepartments.find((department) => department.id === vehicleForm.assignedDepartment)?.units.includes(vehicleForm.assignedOffice) && <option value={vehicleForm.assignedOffice}>{vehicleForm.assignedOffice} — archived</option>}{(assignmentDepartments.find((department) => department.id === vehicleForm.assignedDepartment)?.units ?? []).map((unit)=><option key={unit} value={unit}>{unit}</option>)}</Select></Field>
        <Field label="Fuel"><Select value={vehicleForm.fuel} onChange={(e)=>setVehicleForm({...vehicleForm,fuel:e.target.value})}>{['Gasoline','Diesel','Electric','Hybrid','Other'].map(v=><option key={v}>{v}</option>)}</Select></Field>
        <Field label="Odometer (km)"><Input type="number" value={vehicleForm.odometer} onChange={(e)=>setVehicleForm({...vehicleForm,odometer:e.target.value})}/></Field>
        <Field label="Color"><Input value={vehicleForm.color} onChange={(e)=>setVehicleForm({...vehicleForm,color:e.target.value})}/></Field>
        <Field label="Registration Expiry"><Input type="date" value={vehicleForm.registrationExpiry} onChange={(e)=>setVehicleForm({...vehicleForm,registrationExpiry:e.target.value})}/></Field>
        <div className="sm:col-span-2"><Label>Vehicle Image</Label><Input type="file" accept="image/*" onChange={(e)=>void setImage(e)}/></div>
        <div className="sm:col-span-2"><Label>3D Vehicle Model (GLB)</Label><Input key={vehicleModel3d?.name ?? 'no-model'} type="file" accept=".glb,model/gltf-binary" onChange={(event) => void setModel3d(event)} />{vehicleModel3d && <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{vehicleModel3d.name}</p><p className="text-xs text-slate-500">GLB model attached{vehicleModel3d.size ? ` · ${(vehicleModel3d.size / 1024 / 1024).toFixed(1)} MB` : ''}</p></div><Button type="button" size="sm" variant="ghost" onClick={() => { setVehicleModel3d(undefined); setVehicleModel3dFile(undefined); }}><Trash2 className="h-4 w-4 text-red-600" /> Remove</Button></div>}<p className="mt-1 text-xs text-slate-500">The GLB is uploaded separately and is no longer embedded in the vehicle record.</p></div>
        <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={vehicleForm.notes} onChange={(e)=>setVehicleForm({...vehicleForm,notes:e.target.value})}/></div>
      </div>
    </Dialog>
    <ConfirmDialog open={vehicleDeleteOpen} onClose={() => setVehicleDeleteOpen(false)} onConfirm={deleteVehicle} title="Delete Vehicle?" description={`Delete ${vehicleForm.brand} ${vehicleForm.model} (${vehicleForm.plateNumber}) and all of its inspection, maintenance, registration, checklist, and attachment records? This cannot be undone.`} confirmLabel="Delete Vehicle and Records" destructive />
    <Dialog open={inspectionHistoryOpen} onClose={() => setInspectionHistoryOpen(false)} title="Inspection History" description={`Historical inspections for ${selected?.brand ?? ''} ${selected?.model ?? ''} (${selected?.plateNumber ?? ''}). Select a record to view or edit its details.`} size="lg" footer={<Button variant="outline" onClick={() => setInspectionHistoryOpen(false)}>Close</Button>}>
      {(selected?.inspections ?? []).length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No recent activity</div> : <div className="divide-y overflow-hidden rounded-lg border border-slate-200">{[...(selected?.inspections ?? [])].sort((left, right) => right.date.localeCompare(left.date)).map((inspection) => {
        const entries = getInspectionEntries(inspection);
        return <button type="button" key={inspection.id} onClick={() => editInspection(inspection)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><div><p className="text-sm font-semibold">{inspection.date}</p><p className="text-xs text-slate-500">Inspected by {inspection.inspectedBy || '—'} · {entries.length} {entries.length === 1 ? 'vehicle part' : 'vehicle parts'}</p></div><div className="flex flex-wrap justify-end gap-1">{[...new Set(entries.map((entry) => entry.status))].filter(Boolean).map((status) => <Badge key={status}>{status}</Badge>)}</div></button>;
      })}</div>}
    </Dialog>
    <Dialog open={inspectionOpen} onClose={() => { if (!convertingInspection) { setInspectionOpen(false); setEditingInspectionId(null); } }} title={editingInspectionId ? 'Edit Vehicle Inspection' : 'Conduct Vehicle Inspection'} description={`${editingInspectionId ? 'Update' : 'Record'} one or more vehicle-part inspections for ${selected?.brand ?? ''} ${selected?.model ?? ''} (${selected?.plateNumber ?? ''}).`} size="xl" footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2">{editingInspectionId && <Button variant="outline" disabled={convertingInspection} onClick={() => void addInspectionToTasks()}>{linkedInspectionTaskId ? 'Open Task' : convertingInspection ? 'Creating Task…' : 'Add to our Tasks'}</Button>}<Button variant="outline" onClick={printInspectionReport}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => void exportInspectionPdf()}><FileDown className="h-4 w-4" /> Export to PDF</Button></div><div className="flex gap-2"><Button variant="outline" disabled={convertingInspection} onClick={() => { setInspectionOpen(false); setEditingInspectionId(null); }}>Cancel</Button><Button disabled={convertingInspection || !inspectionForm.entries.length || !inspectionForm.date || !inspectionForm.inspectedBy.trim()} onClick={saveInspection}>{editingInspectionId ? 'Save Changes' : 'Save Inspection'}</Button></div></div>}>
      <div className="space-y-4">
        <div><div className="mb-2 flex items-center justify-between"><h4 className="font-semibold">3D Inspection View</h4><span className="text-xs text-slate-500">Annotations for Vehicle Part {Math.max(inspectionForm.entries.findIndex((entry) => entry.id === activeInspectionEntryId) + 1, 1)}</span></div>{selectedModelUrl ? <VehicleModelViewer ref={modelViewerRef} dataUrl={selectedModelUrl} name={`${selected?.brand ?? ''} ${selected?.model ?? ''}`} annotations={inspectionForm.entries.find((entry) => entry.id === activeInspectionEntryId)?.annotations ?? []} onAnnotationsChange={(annotations) => activeInspectionEntryId && updateInspectionEntry(activeInspectionEntryId, { annotations })} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500"><Car className="mx-auto mb-2 h-8 w-8 text-slate-300" />{selected?.model3d ? 'Loading the attached GLB model…' : 'No GLB model is attached to this vehicle. Use Edit Vehicle to attach one.'}</div>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Inspection Date" required><Input type="date" value={inspectionForm.date} onChange={(event) => setInspectionForm((current) => ({ ...current, date: event.target.value }))} /></Field><Field label="Inspected By" required><Input value={inspectionForm.inspectedBy} onChange={(event) => setInspectionForm((current) => ({ ...current, inspectedBy: event.target.value }))} placeholder="Name of inspector" /></Field></div>
        <div className="space-y-3">{inspectionForm.entries.map((entry, index) => <div key={entry.id} onClick={() => setActiveInspectionEntryId(entry.id)} className={`rounded-xl border p-4 ${activeInspectionEntryId === entry.id ? 'border-brand-400 ring-1 ring-brand-300' : 'border-slate-200'}`}>
          <div className="mb-3 flex items-center justify-between gap-2"><p className="font-semibold">Vehicle Part {index + 1}</p><div className="flex gap-1">{selectedModelUrl && <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void captureInspectionSnapshot(entry.id); }}><Camera className="h-4 w-4" /> Snapshot</Button>}{inspectionForm.entries.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => setInspectionForm((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) }))} title="Remove vehicle part"><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vehicle Part / Activity" required><Select value={entry.activity} onChange={(event) => updateInspectionEntry(entry.id, { activity: event.target.value })}>{inspectionActivities.map((activity) => <option key={activity}>{activity}</option>)}</Select></Field>
            <Field label="Status" required><Select value={entry.status} onChange={(event) => event.target.value === '__create__' ? createInspectionStatus(entry.id) : updateInspectionEntry(entry.id, { status: event.target.value })}>{inspectionStatuses.map((status) => <option key={status}>{status}</option>)}{entry.status && !inspectionStatuses.includes(entry.status) && <option>{entry.status}</option>}<option value="__create__">+ Create Status</option></Select></Field>
            <div><Label>Findings</Label><Textarea value={entry.findings} onChange={(event) => updateInspectionEntry(entry.id, { findings: event.target.value })} placeholder="Condition, issue, or observation found" /></div>
            <div><Label>Action Taken</Label><Textarea value={entry.actionTaken} onChange={(event) => updateInspectionEntry(entry.id, { actionTaken: event.target.value })} placeholder="Immediate action or correction performed" /></div>
            <div><Label>Recommendation</Label><Textarea value={entry.recommendation} onChange={(event) => updateInspectionEntry(entry.id, { recommendation: event.target.value })} placeholder="Recommended follow-up or repair" /></div>
            <div><Label>Notes</Label><Textarea value={entry.notes} onChange={(event) => updateInspectionEntry(entry.id, { notes: event.target.value })} placeholder="Additional inspection notes" /></div>
          </div>
          <div className="mt-3"><p className="mb-2 text-xs font-medium text-slate-500">Photo evidence</p><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ImagePlus className="h-4 w-4" /> Attach Images<input hidden type="file" accept="image/*" multiple onChange={(event) => void attachInspectionPhotos(entry.id, event.target.files)} /></label><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Camera className="h-4 w-4" /> Take Picture<input hidden type="file" accept="image/*" capture="environment" onChange={(event) => void attachInspectionPhotos(entry.id, event.target.files)} /></label></div>{(entry.photos ?? []).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{(entry.photos ?? []).map((photo, photoIndex) => <div key={`${photo.name}-${photoIndex}`} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><img src={photo.dataUrl} alt={photo.name} className="h-28 w-full object-cover" /><button type="button" onClick={() => updateInspectionEntry(entry.id, { photos: (entry.photos ?? []).filter((_, index) => index !== photoIndex) })} className="absolute right-1 top-1 rounded bg-black/65 p-1 text-white opacity-80 hover:bg-red-600 hover:opacity-100" title="Remove photo"><Trash2 className="h-3.5 w-3.5" /></button><p className="truncate px-2 py-1 text-[10px] text-slate-500">{photo.name}</p></div>)}</div>}</div>
          {entry.snapshot && <div className="mt-3"><p className="mb-1 text-xs font-medium text-slate-500">3D inspection snapshot</p><div className="relative inline-block overflow-hidden rounded-lg border border-slate-200"><img src={entry.snapshot.dataUrl} alt={`Inspection snapshot for ${entry.activity}`} className="max-h-52 object-contain" /><button type="button" onClick={() => updateInspectionEntry(entry.id, { snapshot: undefined })} className="absolute right-2 top-2 rounded-md bg-black/65 p-1.5 text-white hover:bg-red-600" title="Delete 3D inspection snapshot" aria-label="Delete 3D inspection snapshot"><Trash2 className="h-4 w-4" /></button></div></div>}
        </div>)}</div>
        <Button type="button" variant="outline" onClick={() => { const entry = { ...newInspectionEntry(), status: inspectionStatuses[0] ?? 'No Problem' }; setInspectionForm((current) => ({ ...current, entries: [...current.entries, entry] })); setActiveInspectionEntryId(entry.id); }}><Plus className="h-4 w-4" /> Add Vehicle Part</Button>
      </div>
    </Dialog>
    <Dialog open={checklistOpen} onClose={() => setChecklistOpen(false)} title="Preventive Maintenance Checklist" description={`Build the ordered maintenance activities for ${selected?.brand ?? ''} ${selected?.model ?? ''} (${selected?.plateNumber ?? ''}). New preventive maintenance schedules will use this checklist.`} size="lg" footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><Button variant="outline" onClick={printChecklist}><Printer className="h-4 w-4" /> Print Checklist</Button><div className="flex gap-2"><Button variant="outline" onClick={() => setChecklistOpen(false)}>Cancel</Button><Button onClick={saveChecklist}>Save Checklist</Button></div></div>}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Drag activities by the handle to arrange the mechanic’s work sequence.</p>
        {checklistDraft.map((item, index) => <div key={item.id} draggable onDragStart={() => setDraggedCheckId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveChecklistItem(item.id)} onDragEnd={() => setDraggedCheckId('')} className={`flex items-center gap-2 rounded-lg border bg-surface p-2 ${draggedCheckId === item.id ? 'opacity-50' : ''}`}>
          <button type="button" className="cursor-grab touch-none p-1 text-slate-400" title="Drag to reorder"><GripVertical className="h-5 w-5" /></button>
          <span className="w-6 text-center text-xs font-semibold text-slate-400">{index + 1}</span>
          <Input aria-label={`Checklist activity ${index + 1}`} value={item.label} onChange={(event) => setChecklistDraft((current) => current.map((entry) => entry.id === item.id ? { ...entry, label: event.target.value } : entry))} placeholder="Maintenance activity" />
          <Button type="button" size="icon" variant="ghost" onClick={() => setChecklistDraft((current) => current.filter((entry) => entry.id !== item.id))} title="Remove activity"><Trash2 className="h-4 w-4 text-red-600" /></Button>
        </div>)}
        <Button type="button" variant="outline" onClick={() => setChecklistDraft((current) => [...current, { id: `TPL-${Date.now()}`, label: '' }])}><Plus className="h-4 w-4" /> Add Activity</Button>
      </div>
    </Dialog>
    <Dialog contentOverflowVisible open={scheduleOpen} onClose={() => { setScheduleOpen(false); setEditingScheduleId(null); }} title={editingScheduleId ? 'Edit Fleet Schedule' : 'Add Fleet Schedule'} description={`${editingScheduleId ? 'Update' : 'Create'} a schedule for ${selected?.plateNumber ?? 'this vehicle'}.`} footer={<><Button variant="outline" onClick={() => { setScheduleOpen(false); setEditingScheduleId(null); }}>Cancel</Button><Button onClick={addSchedule}>{editingScheduleId ? 'Save Changes' : 'Create Schedule'}</Button></>}>
      <div className="space-y-4">
        <Field label="Activity"><Select value={scheduleForm.type} onChange={(event) => setScheduleForm((current) => ({ ...current, type: event.target.value as Schedule['type'] }))}>{['Preventive Maintenance','Registration Renewal'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        {scheduleForm.type === 'Registration Renewal' && <Field label="Schedule Timing"><Select value={scheduleForm.recurrenceMode} onChange={(event) => setScheduleForm((current) => ({ ...current, recurrenceMode: event.target.value as 'specific' | 'annual' }))}><option value="specific">Specific Date / Date Range</option><option value="annual">Recurring Every Year</option></Select></Field>}
        {scheduleForm.type !== 'Registration Renewal' || scheduleForm.recurrenceMode === 'specific'
          ? <DateRangePicker placement="top" required label="Schedule Date / Date Range" startDate={scheduleForm.startDate} endDate={scheduleForm.endDate} onChange={(startDate, endDate) => setScheduleForm((current) => ({ ...current, startDate, endDate }))} />
          : <div className="space-y-3 rounded-lg border border-slate-200 p-3"><div className="grid gap-3 sm:grid-cols-3">
            <Field label="Every Month"><Select value={scheduleForm.recurrenceMonth} onChange={(event) => setScheduleForm((current) => ({ ...current, recurrenceMonth: Number(event.target.value) }))}>{monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</Select></Field>
            <Field label="Starting Week"><Select value={scheduleForm.startWeek} onChange={(event) => { const startWeek = Number(event.target.value); setScheduleForm((current) => ({ ...current, startWeek, endWeek: Math.max(current.endWeek, startWeek) })); }}>{[1,2,3,4,5].map((week) => <option key={week} value={week}>Week {week}</option>)}</Select></Field>
            <Field label="Ending Week"><Select value={scheduleForm.endWeek} onChange={(event) => setScheduleForm((current) => ({ ...current, endWeek: Number(event.target.value) }))}>{[1,2,3,4,5].filter((week) => week >= scheduleForm.startWeek).map((week) => <option key={week} value={week}>Week {week}</option>)}</Select></Field>
          </div><p className="text-xs text-slate-500">Repeats every {monthNames[scheduleForm.recurrenceMonth - 1]}, Week {scheduleForm.startWeek}{scheduleForm.endWeek !== scheduleForm.startWeek ? `–${scheduleForm.endWeek}` : ''}. Next occurrence: {nextAnnualOccurrence({ frequency: 'Annual', month: scheduleForm.recurrenceMonth, startWeek: scheduleForm.startWeek, endWeek: scheduleForm.endWeek }).startDate} to {nextAnnualOccurrence({ frequency: 'Annual', month: scheduleForm.recurrenceMonth, startWeek: scheduleForm.startWeek, endWeek: scheduleForm.endWeek }).endDate}.</p></div>}
      </div>
    </Dialog>
  </div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div><Label required={required}>{label}</Label>{children}</div>; }
function Info({ label, value }: { label: string; value?: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-medium">{value || '—'}</p></div>; }
function getInspectionEntries(inspection: FleetInspection): FleetInspectionEntry[] {
  if (inspection.entries?.length) return inspection.entries;
  const legacy = inspection as FleetInspection & Partial<Omit<FleetInspectionEntry, 'id' | 'status'>>;
  return legacy.activity ? [{ id: `${inspection.id}-legacy`, activity: legacy.activity, status: 'No Problem', findings: legacy.findings ?? '', actionTaken: legacy.actionTaken ?? '', recommendation: legacy.recommendation ?? '', notes: legacy.notes ?? '' }] : [];
}
function ActivitySummaryRow({ title, fields, onClick }: { title: string; fields: Array<[string, string | undefined]>; onClick?: () => void }) {
  const content = <><p className="text-sm font-semibold">{title}</p><div className="mt-1.5 grid gap-2 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="text-xs text-slate-600">{value || 'No recent activity'}</p></div>)}</div></>;
  return onClick ? <button type="button" onClick={onClick} className="block w-full px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">{content}</button> : <div className="px-3 py-3">{content}</div>;
}
function SummarySortButton({ label, sortKey, sort, onSort }: { label: string; sortKey: SummarySortKey; sort: { key: SummarySortKey; direction: 'asc' | 'desc' }; onSort: (key: SummarySortKey) => void }) {
  const Icon = sort.key !== sortKey ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Sort by ${label}${sort.key === sortKey ? ` ${sort.direction === 'asc' ? 'descending' : 'ascending'}` : ''}`}>{label}<Icon className="h-3.5 w-3.5" /></button>;
}
