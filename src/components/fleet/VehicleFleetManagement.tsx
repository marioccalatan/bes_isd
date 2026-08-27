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
import { createFleetMasterInspection, createFleetMasterSchedule, deleteFleetRenewalReceipt, deleteFleetVehicleModel, downloadFleetRenewalReceiptAttachment, fetchFleetMaintenanceSchedule, fetchFleetMasterInspection, fetchFleetMasterVehicleActivity, fetchFleetMasterVehicles, fetchFleetRenewalReceipt, fetchFleetVehicleModel, fetchFleetVehicleModels, fetchFleetVehicles, fetchOrgStructure, saveFleetRenewalReceipt, saveFleetVehicleModels, saveFleetVehicles, updateFleetMasterInspection, updateFleetPreventiveMaintenance, updateFleetRenewalScheduleStatus, uploadFleetVehicleModel, type FleetRenewalReceipt, type OrgDepartment } from '@/lib/api';

type FleetFile = { name: string; type: string; dataUrl: string };
type FleetModelFile = { name: string; type: string; size?: number; dataUrl?: string };
type FleetVehicleModel = { id: string; type: string; brand: string; model: string; model3d?: FleetModelFile };
type CheckItem = { id: string; label: string; checked: boolean; notes: string; photos: FleetFile[] };
export type FleetChecklistTemplateItem = { id: string; label: string };
export type FleetInspectionEntry = { id: string; activity: string; status: string; findings: string; actionTaken: string; recommendation: string; notes: string; annotations?: ModelAnnotation[]; snapshot?: FleetFile; photos?: FleetFile[] };
export type FleetInspection = { id: string; date: string; inspectedBy: string; entries: FleetInspectionEntry[]; convertedTaskId?: string };
export type FleetScheduleRecurrence = { frequency: 'Annual'; month: number; startWeek: number; endWeek: number };
export type FleetSchedule = { id: string; type: 'Inspection' | 'Maintenance' | 'Preventive Maintenance' | 'Registration Renewal'; startDate: string; endDate: string; status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue'; recurrence?: FleetScheduleRecurrence; checklist: CheckItem[]; documents: FleetFile[] };
export type FleetVehicle = { id: string; modelLibraryId?: string; type: string; brand: string; model: string; yearAcquired: string; plateNumber: string; propertyNumber: string; color: string; fuel: string; odometer: string; custodian: string; assignedDepartment?: string; assignedOffice: string; acquisitionCost: string; registrationExpiry: string; notes: string; image?: FleetFile; model3d?: FleetModelFile; preventiveChecklist?: FleetChecklistTemplateItem[]; inspectionStatuses?: string[]; inspections?: FleetInspection[]; schedules: FleetSchedule[] };
type Schedule = FleetSchedule;
type SummarySortKey = 'vehicle' | 'plate' | 'driver' | 'department' | 'type' | 'preventive' | 'registration';
type MasterSortKey = 'vehicle' | 'brand' | 'description' | 'year' | 'acquired' | 'type' | 'driver' | 'department' | 'fuel' | 'status';
type FleetMasterVehicle = { id: string; vehicleNo?: string; plateNo?: string; model?: string; yearModel?: number; brand?: string; description?: string; driver?: string; department?: string; acquiredDate?: string; acquiredCost?: string; engineNo?: string; chassisNo?: string; remarks?: string; fuelType?: string; status?: string; fuelEfficiency?: number; vehicleType: string };
type FleetMasterActivity = {
  schedules: { id: string; type: string; startDate: string; endDate: string; actualDate?: string; status: string; notes?: string }[];
  inspections: { id: string; date: string; inspectedBy: string; status: string; findings?: string; actionTaken?: string; recommendation?: string }[];
};

export const FLEET_STORAGE_KEY = 'bes:vehicle-fleet:v1';
const today = new Date().toISOString().slice(0, 10);
const defaultChecks = ['Engine oil and fluid levels', 'Tires, wheels, and spare tire', 'Brakes and parking brake', 'Lights, signals, and horn', 'Battery and electrical system', 'Steering and suspension', 'Safety equipment and first-aid kit', 'Body, glass, and visible damage', 'Odometer and service interval'];
const inspectionActivities = ['General vehicle condition', ...defaultChecks, 'Roadworthiness and test drive', 'Other'];
const defaultInspectionStatuses = ['No Problem', 'For Replacement', 'Schedule Repair'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const newInspectionEntry = (): FleetInspectionEntry => ({ id: `INSP-ITEM-${Date.now()}-${Math.random().toString(36).slice(2)}`, activity: inspectionActivities[0], status: defaultInspectionStatuses[0], findings: '', actionTaken: '', recommendation: '', notes: '' });
const emptyInspection = { date: today, inspectedBy: '', entries: [newInspectionEntry()] };
const emptyVehicle = { modelLibraryId: '', type: 'Car', brand: '', model: '', yearAcquired: '', plateNumber: '', propertyNumber: '', color: '', fuel: 'Gasoline', odometer: '', custodian: '', assignedDepartment: 'ISD', assignedOffice: 'General Services Office', acquisitionCost: '', registrationExpiry: '', notes: '' };

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
  const scheduleForSummary = (type: FleetSchedule['type']) => nextVehicleSchedule(vehicle, type)
    ?? [...vehicle.schedules].filter((schedule) => schedule.type === type).sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
  return { vehicle: `${vehicle.brand} ${vehicle.model}`, plate: vehicle.plateNumber, driver: vehicle.custodian || 'Unassigned', department: vehicle.assignedDepartment || 'Unassigned', type: vehicle.type || 'Other', preventive: scheduleSummaryLabel(scheduleForSummary('Preventive Maintenance')), registration: scheduleSummaryLabel(scheduleForSummary('Registration Renewal')) };
}
function escapePrintText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
}
function displayDate(value?: string) { return value ? String(value).slice(0, 10) : '—'; }
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
  const [masterVehicles, setMasterVehicles] = useState<FleetMasterVehicle[]>([]);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterError, setMasterError] = useState('');
  const [masterSearch, setMasterSearch] = useState('');
  const [masterType, setMasterType] = useState('ALL');
  const [masterSort, setMasterSort] = useState<{ key: MasterSortKey; direction: 'asc' | 'desc' }>({ key: 'vehicle', direction: 'asc' });
  const [masterPage, setMasterPage] = useState(1);
  const [masterPageSize, setMasterPageSize] = useState(25);
  const [masterContext, setMasterContext] = useState<{ vehicle: FleetMasterVehicle; x: number; y: number } | null>(null);
  const [masterDetailVehicle, setMasterDetailVehicle] = useState<FleetMasterVehicle | null>(null);
  const [masterDetailTab, setMasterDetailTab] = useState<'details' | 'schedules' | 'renewals' | 'history'>('details');
  const [masterActivity, setMasterActivity] = useState<FleetMasterActivity>({ schedules: [], inspections: [] });
  const [masterActivityLoading, setMasterActivityLoading] = useState(false);
  const [masterActivityError, setMasterActivityError] = useState('');
  const [masterActionVehicle, setMasterActionVehicle] = useState<FleetMasterVehicle | null>(null);
  const [masterScheduleOpen, setMasterScheduleOpen] = useState(false);
  const [masterScheduleForm, setMasterScheduleForm] = useState<{ scheduleType: 'Preventive Maintenance' | 'Registration Renewal'; startDate: string; endDate: string; notes: string }>({ scheduleType: 'Preventive Maintenance', startDate: today, endDate: today, notes: '' });
  const [masterInspectionOpen, setMasterInspectionOpen] = useState(false);
  const [editingMasterInspectionId, setEditingMasterInspectionId] = useState<string | null>(null);
  const [masterInspectionForm, setMasterInspectionForm] = useState({ inspectionDate: today, inspectedBy: '', inspectionStatus: 'No Problem', findings: '', actionTaken: '', recommendation: '' });
  const [masterInspectionItems, setMasterInspectionItems] = useState<FleetInspectionEntry[]>([newInspectionEntry()]);
  const [activeMasterInspectionItemId, setActiveMasterInspectionItemId] = useState('');
  const [masterInspectionModelUrl, setMasterInspectionModelUrl] = useState('');
  const [savingMasterAction, setSavingMasterAction] = useState(false);
  const [renewalReceiptSchedule, setRenewalReceiptSchedule] = useState<FleetMasterActivity['schedules'][number] | null>(null);
  const [renewalReceiptForm, setRenewalReceiptForm] = useState<FleetRenewalReceipt>({});
  const [renewalReceiptFile, setRenewalReceiptFile] = useState<File>();
  const [renewalReceiptLoading, setRenewalReceiptLoading] = useState(false);
  const [renewalReceiptExists, setRenewalReceiptExists] = useState(false);
  const [renewalReceiptDeleteOpen, setRenewalReceiptDeleteOpen] = useState(false);
  const [vehicleModels, setVehicleModels] = useState<FleetVehicleModel[]>([]);
  const [modelLibraryOpen, setModelLibraryOpen] = useState(false);
  const [modelLibraryForm, setModelLibraryForm] = useState({ type: 'Car', brand: '', model: '' });
  const [modelLibraryTypeFilter, setModelLibraryTypeFilter] = useState('ALL');
  const [modelLibraryFile, setModelLibraryFile] = useState<File>();
  const [editingModelLibraryId, setEditingModelLibraryId] = useState<string | null>(null);
  const [modelLibraryDeleteOpen, setModelLibraryDeleteOpen] = useState(false);
  const [editingModelLibraryForm, setEditingModelLibraryForm] = useState({ type: 'Car', brand: '', model: '' });
  const [editingModelLibraryFile, setEditingModelLibraryFile] = useState<File>();
  const [savingModelLibrary, setSavingModelLibrary] = useState(false);
  const modelLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const editingModelLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const lastLocalMutationRef = useRef(0);
  const applyingServerUpdateRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleDeleteOpen, setVehicleDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryScheduleVehicles, setSummaryScheduleVehicles] = useState<FleetVehicle[]>([]);
  const [summaryScheduleLoading, setSummaryScheduleLoading] = useState(true);
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
  const modelLibraryBrands = useMemo(() => [...new Set(vehicleModels.map((item) => item.brand))].sort(), [vehicleModels]);
  const vehicleModelTypes = useMemo(() => [...new Set(vehicleModels.map((item) => item.type).filter(Boolean))].sort(), [vehicleModels]);
  const filteredVehicleModels = useMemo(() => vehicleModels
    .filter((item) => modelLibraryTypeFilter === 'ALL' || item.type === modelLibraryTypeFilter)
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model)), [modelLibraryTypeFilter, vehicleModels]);
  const modelsForSelectedBrand = useMemo(() => vehicleModels.filter((item) => item.brand === vehicleForm.brand).sort((a, b) => a.model.localeCompare(b.model)), [vehicleModels, vehicleForm.brand]);
  const filteredVehicles = useMemo(() => vehicles.filter((vehicle) => registryFilterMode === 'all'
    || (registryFilterMode === 'department' ? (vehicle.assignedDepartment || 'Unassigned') === registryFilterValue : (vehicle.type || 'Other') === registryFilterValue)), [vehicles, registryFilterMode, registryFilterValue]);
  const summaryVehicles = useMemo(() => [...summaryScheduleVehicles].sort((left, right) => {
    const leftValue = fleetSummaryRow(left)[summarySort.key];
    const rightValue = fleetSummaryRow(right)[summarySort.key];
    const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
    return summarySort.direction === 'asc' ? comparison : -comparison;
  }), [summaryScheduleVehicles, summarySort]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchOrgStructure(token).then((result) => { if (!cancelled) setOrgDepartments(result); }).catch(() => { /* keep the offline fallback */ });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) { setSummaryScheduleLoading(false); return; }
    setSummaryScheduleLoading(true);
    fetchFleetMaintenanceSchedule<FleetVehicle[]>(token)
      .then((items) => { if (!cancelled) setSummaryScheduleVehicles(items); })
      .catch((error) => console.warn('Unable to load the Oracle fleet schedule summary.', error))
      .finally(() => { if (!cancelled) setSummaryScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setSelectedModelUrl(selected?.model3d?.dataUrl || '');
    if (!token || !selected?.model3d || selected.model3d.dataUrl) return;
    fetchFleetVehicleModel(token, selected.modelLibraryId || selected.id).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setSelectedModelUrl(objectUrl);
    }).catch((error) => console.warn('Unable to load the vehicle 3D model.', error));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [selected?.id, selected?.modelLibraryId, selected?.model3d?.name, token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    setMasterLoading(true);
    fetchFleetMasterVehicles<FleetMasterVehicle[]>(token).then((items) => {
      if (!cancelled) { setMasterVehicles(items); setMasterError(''); }
    }).catch((error) => {
      if (!cancelled) setMasterError(error instanceof Error ? error.message : 'Unable to load the vehicle master list.');
    }).finally(() => { if (!cancelled) setMasterLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchFleetVehicleModels<FleetVehicleModel[]>(token).then((models) => { if (!cancelled) setVehicleModels(models); }).catch((error) => console.warn('Unable to load the vehicle model library.', error));
    return () => { cancelled = true; };
  }, [token]);

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
      const selectedLibraryModel = vehicleModels.find((item) => item.id === vehicleForm.modelLibraryId);
      let model = selectedLibraryModel?.model3d ?? vehicleModel3d;
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
      modelLibraryId: vehicle.modelLibraryId ?? '', type: vehicle.type, brand: vehicle.brand, model: vehicle.model, yearAcquired: vehicle.yearAcquired,
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
    printWindow.document.write(`<!doctype html><html><head><title>Vehicle Fleet Schedule Summary</title><style>body{font:13px Arial,sans-serif;color:#111;padding:30px}.header{display:flex;align-items:center;gap:14px;border-bottom:2px solid #166534;padding-bottom:12px;margin-bottom:20px}.logo{width:58px;height:58px;object-fit:contain}h1{font-size:20px;margin:0}.sub{margin-top:4px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #444;padding:8px;text-align:left;vertical-align:top}th{background:#e8f3eb}.muted{color:#666}@media print{body{padding:0}}</style></head><body><div class="header"><img class="logo" src="${benecoLogo}" alt="BENECO logo"><div><h1>Vehicle Fleet Schedule Summary</h1><div class="sub">Benguet Electric Cooperative · Generated ${new Date().toLocaleDateString()}</div></div></div><table><thead><tr><th>No.</th><th>Vehicle</th><th>Plate No.</th><th>Driver</th><th>Department</th><th>Vehicle Type</th><th>Preventive Maintenance</th><th>Registration Renewal</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapePrintText(row.vehicle)}</td><td>${escapePrintText(row.plate)}</td><td>${escapePrintText(row.driver)}</td><td>${escapePrintText(row.department)}</td><td>${escapePrintText(row.type)}</td><td>${escapePrintText(row.preventive)}</td><td>${escapePrintText(row.registration)}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
  }
  function exportFleetSummary() {
    const rows = summaryVehicles.map((vehicle) => fleetSummaryRow(vehicle));
    const table = `<table><thead><tr><th>No.</th><th>Vehicle</th><th>Plate Number</th><th>Driver</th><th>Department</th><th>Vehicle Type</th><th>Preventive Maintenance Schedule</th><th>Registration Renewal Schedule</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${escapePrintText(row.vehicle)}</td><td>${escapePrintText(row.plate)}</td><td>${escapePrintText(row.driver)}</td><td>${escapePrintText(row.department)}</td><td>${escapePrintText(row.type)}</td><td>${escapePrintText(row.preventive)}</td><td>${escapePrintText(row.registration)}</td></tr>`).join('')}</tbody></table>`;
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
  async function openFleetSummary() {
    setSummaryOpen(true);
    if (!token) return;
    setSummaryScheduleLoading(true);
    try {
      setSummaryScheduleVehicles(await fetchFleetMaintenanceSchedule<FleetVehicle[]>(token));
    } catch (error) {
      toast({ kind: 'error', title: 'Schedule summary was not refreshed', description: error instanceof Error ? error.message : 'Unable to load the Oracle fleet schedule summary.' });
    } finally {
      setSummaryScheduleLoading(false);
    }
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
  function openModelLibrary() {
    setEditingModelLibraryId(null); setModelLibraryTypeFilter('ALL'); setModelLibraryForm({ type: vehicleModelTypes[0] ?? '', brand: '', model: '' }); setModelLibraryFile(undefined); if (modelLibraryInputRef.current) modelLibraryInputRef.current.value = ''; setModelLibraryOpen(true);
  }
  function editModelLibraryItem(item: FleetVehicleModel) {
    setEditingModelLibraryId(item.id); setEditingModelLibraryForm({ type: item.type, brand: item.brand, model: item.model }); setEditingModelLibraryFile(undefined); if (editingModelLibraryInputRef.current) editingModelLibraryInputRef.current.value = '';
  }
  async function saveModelLibraryItem() {
    if (!token || !modelLibraryForm.brand.trim() || !modelLibraryForm.model.trim() || !modelLibraryFile) return;
    if (!modelLibraryFile.name.toLowerCase().endsWith('.glb')) { toast({ kind: 'error', title: 'Unsupported 3D model', description: 'Please attach a GLB (.glb) file.' }); return; }
    const duplicate = vehicleModels.some((item) => item.brand.toLowerCase() === modelLibraryForm.brand.trim().toLowerCase() && item.model.toLowerCase() === modelLibraryForm.model.trim().toLowerCase());
    if (duplicate) { toast({ kind: 'error', title: 'Vehicle model already exists', description: 'Edit or use the existing brand-model entry.' }); return; }
    setSavingModelLibrary(true);
    try {
      const id = `MODEL-${Date.now()}`;
      const model3d = await uploadFleetVehicleModel(token, id, modelLibraryFile);
      const updatedItem = { id, type: modelLibraryForm.type, brand: modelLibraryForm.brand.trim(), model: modelLibraryForm.model.trim(), model3d };
      const next = [...vehicleModels, updatedItem];
      await saveFleetVehicleModels(token, next); setVehicleModels(next);
      setModelLibraryForm({ type: vehicleModelTypes[0] ?? '', brand: '', model: '' }); setModelLibraryFile(undefined); if (modelLibraryInputRef.current) modelLibraryInputRef.current.value = '';
      toast({ kind: 'success', title: 'Vehicle model added', description: `${updatedItem.brand} ${updatedItem.model} is now available to all fleet vehicles.` });
    } catch (error) { toast({ kind: 'error', title: 'Vehicle model was not saved', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSavingModelLibrary(false); }
  }
  async function saveEditedModelLibraryItem() {
    if (!token || !editingModelLibraryId || !editingModelLibraryForm.brand.trim() || !editingModelLibraryForm.model.trim()) return;
    if (editingModelLibraryFile && !editingModelLibraryFile.name.toLowerCase().endsWith('.glb')) { toast({ kind: 'error', title: 'Unsupported 3D model', description: 'Please attach a GLB (.glb) file.' }); return; }
    const duplicate = vehicleModels.some((item) => item.id !== editingModelLibraryId && item.brand.toLowerCase() === editingModelLibraryForm.brand.trim().toLowerCase() && item.model.toLowerCase() === editingModelLibraryForm.model.trim().toLowerCase());
    if (duplicate) { toast({ kind: 'error', title: 'Vehicle model already exists', description: 'Use a different brand-model combination.' }); return; }
    const existing = vehicleModels.find((item) => item.id === editingModelLibraryId); if (!existing) return;
    setSavingModelLibrary(true);
    try {
      const model3d = editingModelLibraryFile ? await uploadFleetVehicleModel(token, existing.id, editingModelLibraryFile) : existing.model3d;
      const updatedItem = { ...existing, type: editingModelLibraryForm.type, brand: editingModelLibraryForm.brand.trim(), model: editingModelLibraryForm.model.trim(), model3d };
      const next = vehicleModels.map((item) => item.id === existing.id ? updatedItem : item); await saveFleetVehicleModels(token, next); setVehicleModels(next);
      persist(vehicles.map((vehicle) => vehicle.modelLibraryId === existing.id ? { ...vehicle, type: updatedItem.type, brand: updatedItem.brand, model: updatedItem.model, model3d: updatedItem.model3d } : vehicle));
      setEditingModelLibraryId(null); setEditingModelLibraryFile(undefined); toast({ kind: 'success', title: 'Vehicle model updated', description: `${updatedItem.brand} ${updatedItem.model} was updated.` });
    } catch (error) { toast({ kind: 'error', title: 'Vehicle model was not updated', description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSavingModelLibrary(false); }
  }
  async function deleteModelLibraryItem() {
    if (!token || !editingModelLibraryId) return;
    const existing = vehicleModels.find((item) => item.id === editingModelLibraryId); if (!existing) return;
    setSavingModelLibrary(true);
    try {
      const nextModels = vehicleModels.filter((item) => item.id !== existing.id);
      await saveFleetVehicleModels(token, nextModels);
      if (existing.model3d) await deleteFleetVehicleModel(token, existing.id);
      setVehicleModels(nextModels);
      persist(vehicles.map((vehicle) => vehicle.modelLibraryId === existing.id ? { ...vehicle, modelLibraryId: undefined, model3d: undefined } : vehicle));
      setModelLibraryDeleteOpen(false); setEditingModelLibraryId(null); setEditingModelLibraryFile(undefined);
      toast({ kind: 'success', title: 'Vehicle model deleted', description: `${existing.brand} ${existing.model} was removed from the library.` });
    } catch (error) { toast({ kind: 'error', title: 'Vehicle model was not deleted', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingModelLibrary(false); }
  }

  const filteredMasterVehicles = useMemo(() => {
    const query = masterSearch.trim().toLowerCase();
    return masterVehicles.filter((vehicle) => (masterType === 'ALL' || vehicle.vehicleType === masterType)
      && (!query || [vehicle.vehicleNo, vehicle.plateNo, vehicle.brand, vehicle.model, vehicle.description, vehicle.driver, vehicle.department].some((value) => String(value ?? '').toLowerCase().includes(query))));
  }, [masterSearch, masterType, masterVehicles]);

  const masterVehicleTypes = useMemo(() => [...new Set(masterVehicles.map((vehicle) => vehicle.vehicleType).filter(Boolean))].sort(), [masterVehicles]);

  const sortedMasterVehicles = useMemo(() => {
    const valueFor = (vehicle: FleetMasterVehicle, key: MasterSortKey) => {
      if (key === 'vehicle') return vehicle.plateNo ?? '';
      if (key === 'brand') return `${vehicle.brand ?? ''} ${vehicle.model ?? ''}`;
      if (key === 'year') return vehicle.yearModel ?? 0;
      if (key === 'acquired') return vehicle.acquiredDate ?? '';
      if (key === 'type') return vehicle.vehicleType;
      if (key === 'fuel') return vehicle.fuelType ?? '';
      return vehicle[key] ?? '';
    };
    return [...filteredMasterVehicles].sort((left, right) => {
      const leftValue = valueFor(left, masterSort.key);
      const rightValue = valueFor(right, masterSort.key);
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
      return masterSort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredMasterVehicles, masterSort]);

  function toggleMasterSort(key: MasterSortKey) {
    setMasterSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
    setMasterPage(1);
  }

  useEffect(() => { setMasterPage(1); }, [masterSearch, masterType, masterPageSize]);
  const masterPageCount = Math.max(1, Math.ceil(filteredMasterVehicles.length / masterPageSize));
  const pagedMasterVehicles = useMemo(() => sortedMasterVehicles.slice((masterPage - 1) * masterPageSize, masterPage * masterPageSize), [sortedMasterVehicles, masterPage, masterPageSize]);

  function openMasterSchedule(vehicle: FleetMasterVehicle, scheduleType: 'Preventive Maintenance' | 'Registration Renewal') {
    setMasterContext(null); setMasterActionVehicle(vehicle); setMasterScheduleForm({ scheduleType, startDate: today, endDate: today, notes: '' }); setMasterScheduleOpen(true);
  }
  async function openMasterInspection(vehicle: FleetMasterVehicle) {
    setEditingMasterInspectionId(null); setMasterContext(null); setMasterActionVehicle(vehicle); setMasterInspectionForm({ inspectionDate: today, inspectedBy: user?.name ?? '', inspectionStatus: 'No Problem', findings: '', actionTaken: '', recommendation: '' });
    const item = newInspectionEntry(); setMasterInspectionItems([item]); setActiveMasterInspectionItemId(item.id); setMasterInspectionModelUrl(''); setMasterInspectionOpen(true);
    if (!token) return;
    const libraryModel = vehicleModels.find((item) => item.brand.trim().toLowerCase() === (vehicle.brand ?? '').trim().toLowerCase() && item.model.trim().toLowerCase() === (vehicle.model ?? '').trim().toLowerCase() && item.model3d);
    if (!libraryModel) return;
    try { const blob = await fetchFleetVehicleModel(token, libraryModel.id); setMasterInspectionModelUrl(URL.createObjectURL(blob)); }
    catch (error) { toast({ kind: 'error', title: '3D model could not be loaded', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }
  async function editMasterInspection(inspectionId: string) {
    if (!token || !masterDetailVehicle) return;
    setSavingMasterAction(true);
    try {
      const inspection = await fetchFleetMasterInspection<{ inspectionDate: string; inspectedBy: string; inspectionStatus: string; items: FleetInspectionEntry[] }>(token, inspectionId);
      setEditingMasterInspectionId(inspectionId); setMasterActionVehicle(masterDetailVehicle); setMasterInspectionForm({ inspectionDate: inspection.inspectionDate, inspectedBy: inspection.inspectedBy, inspectionStatus: inspection.inspectionStatus, findings: '', actionTaken: '', recommendation: '' }); setMasterInspectionItems(inspection.items); setActiveMasterInspectionItemId(inspection.items[0]?.id ?? ''); setMasterInspectionModelUrl(''); setMasterInspectionOpen(true);
      const libraryModel = vehicleModels.find((item) => item.brand.trim().toLowerCase() === (masterDetailVehicle.brand ?? '').trim().toLowerCase() && item.model.trim().toLowerCase() === (masterDetailVehicle.model ?? '').trim().toLowerCase() && item.model3d);
      if (libraryModel) { const blob = await fetchFleetVehicleModel(token, libraryModel.id); setMasterInspectionModelUrl(URL.createObjectURL(blob)); }
    } catch (error) { toast({ kind: 'error', title: 'Inspection could not be opened', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingMasterAction(false); }
  }
  async function openMasterDetails(vehicle: FleetMasterVehicle) {
    setMasterContext(null); setMasterDetailVehicle(vehicle); setMasterDetailTab('details');
    setMasterActivity({ schedules: [], inspections: [] }); setMasterActivityError('');
    if (!token) return;
    setMasterActivityLoading(true);
    try { setMasterActivity(await fetchFleetMasterVehicleActivity<FleetMasterActivity>(token, vehicle.id)); }
    catch (error) { setMasterActivityError(error instanceof Error ? error.message : 'Unable to load schedules and history.'); }
    finally { setMasterActivityLoading(false); }
  }
  async function saveMasterSchedule() {
    if (!token || !masterActionVehicle || !masterScheduleForm.startDate || !masterScheduleForm.endDate) return;
    setSavingMasterAction(true);
    try { await createFleetMasterSchedule(token, { vehicleMasterId: masterActionVehicle.id, ...masterScheduleForm }); setMasterScheduleOpen(false); toast({ kind: 'success', title: 'Schedule created', description: `${masterScheduleForm.scheduleType} was linked to vehicle master ID ${masterActionVehicle.id}.` }); }
    catch (error) { toast({ kind: 'error', title: 'Schedule was not created', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingMasterAction(false); }
  }
  async function saveMasterInspection() {
    if (!token || !masterActionVehicle || !masterInspectionForm.inspectionDate || !masterInspectionForm.inspectedBy.trim()) return;
    setSavingMasterAction(true);
    try { const payload = { inspectionDate: masterInspectionForm.inspectionDate, inspectedBy: masterInspectionForm.inspectedBy, inspectionStatus: masterInspectionItems.some((item) => item.status !== 'No Problem') ? 'With Findings' : 'No Problem', items: masterInspectionItems.map((item) => ({ id: item.id, activity: item.activity, status: item.status, findings: item.findings, actionTaken: item.actionTaken, recommendation: item.recommendation, annotations: item.annotations, snapshot: item.snapshot ? { name: item.snapshot.name, dataUrl: item.snapshot.dataUrl } : undefined, photos: (item.photos ?? []).map((photo) => ({ name: photo.name, dataUrl: photo.dataUrl })) })) }; if (editingMasterInspectionId) await updateFleetMasterInspection(token, editingMasterInspectionId, payload); else await createFleetMasterInspection(token, { vehicleMasterId: masterActionVehicle.id, ...payload }); setMasterInspectionOpen(false); setEditingMasterInspectionId(null); toast({ kind: 'success', title: editingMasterInspectionId ? 'Inspection updated' : 'Inspection recorded', description: `${masterInspectionItems.length} separate inspection detail record${masterInspectionItems.length === 1 ? '' : 's'} and their evidence were saved in Oracle.` }); }
    catch (error) { toast({ kind: 'error', title: 'Inspection was not recorded', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingMasterAction(false); }
  }
  function updateMasterInspectionItem(id: string, changes: Partial<FleetInspectionEntry>) { setMasterInspectionItems((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item)); }
  async function captureMasterInspectionSnapshot() {
    try { const dataUrl = await modelViewerRef.current?.captureSnapshot(); if (dataUrl && activeMasterInspectionItemId) updateMasterInspectionItem(activeMasterInspectionItemId, { snapshot: { name: `vehicle-inspection-${masterInspectionForm.inspectionDate}-${activeMasterInspectionItemId}.png`, type: 'image/png', dataUrl } }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to capture snapshot', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }
  function printMasterInspection(items: FleetInspectionEntry[] = masterInspectionItems) {
    if (!masterActionVehicle || !items.length) return;
    const popup = window.open('', '_blank', 'width=1100,height=850'); if (!popup) return;
    const details = items.map((item, index) => `<section><div class="detail-head"><h2>Inspection Detail ${masterInspectionItems.indexOf(item) + 1}</h2><span>${escapePrintText(item.status)}</span></div><table><tr><th>Vehicle Part / Activity</th><td colspan="3">${escapePrintText(item.activity)}</td></tr><tr><th>Findings</th><td>${escapePrintText(item.findings || '—')}</td><th>Action Taken</th><td>${escapePrintText(item.actionTaken || '—')}</td></tr><tr><th>Recommendation</th><td colspan="3">${escapePrintText(item.recommendation || '—')}</td></tr></table>${item.snapshot ? `<h3>Annotated 3D Snapshot</h3><img class="snapshot" src="${item.snapshot.dataUrl}" alt="3D inspection snapshot">` : ''}${(item.photos ?? []).length ? `<h3>Attached Photo Evidence</h3><div class="photos">${(item.photos ?? []).map((photo) => `<figure><img src="${photo.dataUrl}" alt="${escapePrintText(photo.name)}"><figcaption>${escapePrintText(photo.name)}</figcaption></figure>`).join('')}</div>` : ''}</section>`).join('');
    popup.document.write(`<!doctype html><html><head><title>Vehicle Inspection Report</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#111;margin:0}.header{display:grid;grid-template-columns:72px 1fr auto;align-items:center;border-bottom:2px solid #166534;padding-bottom:10px}.logo{width:62px;height:62px;object-fit:contain}.org{font-size:16px;font-weight:700;color:#14532d}.title{font-size:21px;font-weight:700;margin-top:3px}.generated{text-align:right;color:#555}.meta{display:grid;grid-template-columns:1fr 1fr;gap:7px 20px;margin:14px 0;padding:10px;background:#f0f7f2;border:1px solid #b8d6c1}.meta b{display:inline-block;min-width:100px}section{margin-top:18px;break-inside:avoid;border-top:2px solid #333;padding-top:9px}.detail-head{display:flex;justify-content:space-between;align-items:center}.detail-head h2{font-size:15px;margin:0 0 8px}.detail-head span{border:1px solid #777;border-radius:12px;padding:3px 9px;font-size:10px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap}th{width:18%;background:#eee}.snapshot{display:block;max-width:520px;max-height:310px;object-fit:contain;border:1px solid #aaa;margin-top:6px}.photos{display:flex;flex-wrap:wrap;gap:9px}.photos figure{margin:0;width:190px}.photos img{width:190px;height:135px;object-fit:cover;border:1px solid #aaa}.photos figcaption{font-size:9px;overflow-wrap:anywhere;margin-top:2px}h3{font-size:12px;margin:12px 0 4px}.actions{text-align:right;margin:0 0 10px}.actions button{background:#15803d;color:white;border:0;border-radius:5px;padding:8px 15px;font-weight:700}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Print</button></div><header class="header"><img class="logo" src="${benecoLogo}" alt="BENECO logo"><div><div class="org">Benguet Electric Cooperative</div><div class="title">Vehicle Inspection Report</div></div><div class="generated">Generated<br>${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></header><div class="meta"><div><b>Vehicle:</b> ${escapePrintText(`${masterActionVehicle.brand ?? ''} ${masterActionVehicle.model ?? masterActionVehicle.description ?? ''}`)}</div><div><b>Plate No.:</b> ${escapePrintText(masterActionVehicle.plateNo ?? '—')}</div><div><b>Inspection Date:</b> ${escapePrintText(masterInspectionForm.inspectionDate)}</div><div><b>Inspected By:</b> ${escapePrintText(masterInspectionForm.inspectedBy)}</div><div><b>Master ID:</b> ${escapePrintText(masterActionVehicle.id)}</div><div><b>Details:</b> ${items.length}${items.length === 1 ? ' item' : ' items'}</div></div>${details}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`); popup.document.close();
  }
  async function openRenewalReceipt(schedule: FleetMasterActivity['schedules'][number]) {
    if (!token) return;
    setRenewalReceiptSchedule(schedule); setRenewalReceiptFile(undefined); setRenewalReceiptLoading(true);
    try { const receipt = (await fetchFleetRenewalReceipt(token, schedule.id)).receipt; setRenewalReceiptExists(Boolean(receipt)); setRenewalReceiptForm(receipt ?? {}); }
    catch (error) { toast({ kind: 'error', title: 'Receipt details could not be loaded', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setRenewalReceiptLoading(false); }
  }
  async function deleteRenewalReceiptDetails() {
    if (!token || !renewalReceiptSchedule) return;
    setRenewalReceiptLoading(true);
    try { await deleteFleetRenewalReceipt(token, renewalReceiptSchedule.id); setRenewalReceiptDeleteOpen(false); setRenewalReceiptSchedule(null); setRenewalReceiptExists(false); toast({ kind: 'success', title: 'Official receipt details deleted' }); }
    catch (error) { toast({ kind: 'error', title: 'Receipt details were not deleted', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setRenewalReceiptLoading(false); }
  }
  async function changeRenewalStatus(scheduleId: string, status: 'Scheduled' | 'In Progress' | 'Registered') {
    if (!token) return;
    const previous = masterActivity;
    setMasterActivity((current) => ({ ...current, schedules: current.schedules.map((schedule) => schedule.id === scheduleId ? { ...schedule, status } : schedule) }));
    try { await updateFleetRenewalScheduleStatus(token, scheduleId, status); toast({ kind: 'success', title: 'Renewal status updated', description: status }); }
    catch (error) { setMasterActivity(previous); toast({ kind: 'error', title: 'Renewal status was not updated', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }
  async function changePreventiveMaintenance(scheduleId: string, changes: { status?: 'Scheduled' | 'Completed'; actualDate?: string }) {
    if (!token) return;
    const previous = masterActivity;
    const currentSchedule = masterActivity.schedules.find((schedule) => schedule.id === scheduleId);
    if (!currentSchedule) return;
    const status = changes.status ?? (currentSchedule.status as 'Scheduled' | 'Completed');
    const actualDate = changes.actualDate ?? currentSchedule.actualDate ?? '';
    setMasterActivity((current) => ({ ...current, schedules: current.schedules.map((schedule) => schedule.id === scheduleId ? { ...schedule, status, actualDate } : schedule) }));
    try { await updateFleetPreventiveMaintenance(token, scheduleId, { status, actualDate }); toast({ kind: 'success', title: 'Maintenance schedule updated' }); }
    catch (error) { setMasterActivity(previous); toast({ kind: 'error', title: 'Maintenance schedule was not updated', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }
  async function saveRenewalReceiptDetails() {
    if (!token || !renewalReceiptSchedule) return;
    setRenewalReceiptLoading(true);
    try {
      let attachment;
      if (renewalReceiptFile) attachment = { name: renewalReceiptFile.name, dataUrl: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(renewalReceiptFile); }) };
      const { attachment: _currentAttachment, ...receiptDetails } = renewalReceiptForm;
      await saveFleetRenewalReceipt(token, renewalReceiptSchedule.id, { ...receiptDetails, ...(attachment ? { attachment } : {}) });
      setRenewalReceiptSchedule(null); toast({ kind: 'success', title: 'Official receipt details saved' });
    } catch (error) { toast({ kind: 'error', title: 'Receipt details were not saved', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setRenewalReceiptLoading(false); }
  }

  const metricCards = useMemo(() => [
    { label: 'Fleet Size', value: masterVehicles.length, icon: Car, tone: 'text-brand-700 bg-brand-50' },
    { label: 'Due on Schedule', value: due, icon: CalendarRange, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Overdue', value: overdue, icon: Wrench, tone: 'text-red-700 bg-red-50' },
    { label: 'Schedule Compliance', value: `${compliance}%`, icon: Gauge, tone: 'text-emerald-700 bg-emerald-50' },
  ], [masterVehicles, due, overdue, compliance]);

  return <div className="space-y-5">
    <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={openModelLibrary}><Car className="h-4 w-4" /> Add Vehicle Model</Button><Button variant="outline" onClick={() => void openFleetSummary()}><List className="h-4 w-4" /> Summary View</Button><Button variant="outline" onClick={() => window.open('/workspace/vehicle-fleet/maintenance-schedule', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Maintenance Schedule <ExternalLink className="h-3.5 w-3.5" /></Button><Button variant="outline" onClick={() => window.open('/workspace/vehicle-fleet/renewal-schedule', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Renewal Schedule <ExternalLink className="h-3.5 w-3.5" /></Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-3 p-4"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div></Card>)}</div>
    <Card className="overflow-hidden" onClick={() => setMasterContext(null)}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
        <div><h3 className="font-semibold">Vehicle Registry</h3><p className="text-xs text-slate-500">Active vehicles with an assigned type from ISD.VMS_VEHICLE_MAST</p></div>
        <div className="flex flex-1 flex-wrap justify-end gap-2"><Input className="min-w-56 max-w-sm" aria-label="Search vehicle registry" placeholder="Search plate, vehicle, driver, department…" value={masterSearch} onChange={(event) => setMasterSearch(event.target.value)} /><Select className="w-52" aria-label="Filter by vehicle type" value={masterType} onChange={(event) => setMasterType(event.target.value)}><option value="ALL">All vehicle types</option>{masterVehicleTypes.map((vehicleType) => <option key={vehicleType} value={vehicleType}>{vehicleType}</option>)}</Select></div>
      </div>
      {masterLoading ? <div className="p-10 text-center text-sm text-slate-500">Loading vehicle master list…</div> : masterError ? <div className="p-10 text-center text-sm text-red-600">{masterError}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1280px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 text-left">No.</th>{([['vehicle', 'Plate No.'], ['brand', 'Brand / Model'], ['description', 'Description'], ['year', 'Year'], ['acquired', 'Acquired Date'], ['type', 'Type'], ['driver', 'Driver'], ['department', 'Department'], ['fuel', 'Fuel'], ['status', 'Status']] as Array<[MasterSortKey, string]>).map(([key, label]) => <th key={key} className="px-3 py-3 text-left"><MasterSortButton label={label} sortKey={key} sort={masterSort} onSort={toggleMasterSort} /></th>)}</tr></thead><tbody className="divide-y divide-slate-100">{pagedMasterVehicles.map((vehicle, index) => <tr key={vehicle.id} onClick={() => void openMasterDetails(vehicle)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setMasterContext({ vehicle, x: event.clientX, y: event.clientY }); }} className="cursor-pointer hover:bg-slate-50 focus-within:bg-slate-50"><td className="px-3 py-3 text-slate-500">{(masterPage - 1) * masterPageSize + index + 1}</td><td className="px-3 py-3 font-medium">{vehicle.plateNo || '—'}</td><td className="px-3 py-3"><p className="font-medium">{vehicle.brand && vehicle.brand !== '-' ? vehicle.brand : '—'}</p><p className="text-xs text-slate-500">{vehicle.model && vehicle.model !== '-' ? vehicle.model : 'Model not recorded'}</p></td><td className="max-w-xs px-3 py-3 text-slate-600">{vehicle.description && vehicle.description !== '-' ? vehicle.description : '—'}</td><td className="px-3 py-3">{vehicle.yearModel || '—'}</td><td className="px-3 py-3 whitespace-nowrap">{displayDate(vehicle.acquiredDate)}</td><td className="px-3 py-3"><Badge>{vehicle.vehicleType}</Badge></td><td className="max-w-56 px-3 py-3 text-slate-600">{vehicle.driver || '—'}</td><td className="px-3 py-3">{vehicle.department || '—'}</td><td className="px-3 py-3">{vehicle.fuelType || '—'}</td><td className="px-3 py-3"><Badge>{vehicle.status || 'Unknown'}</Badge></td></tr>)}</tbody></table>{filteredMasterVehicles.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No vehicles match the current filters.</div>}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><span>Showing {filteredMasterVehicles.length ? (masterPage - 1) * masterPageSize + 1 : 0}–{Math.min(masterPage * masterPageSize, filteredMasterVehicles.length)} of {filteredMasterVehicles.length.toLocaleString()} filtered records ({masterVehicles.length.toLocaleString()} total)</span><div className="flex items-center gap-2"><Select aria-label="Rows per page" className="w-24" value={String(masterPageSize)} onChange={(event) => setMasterPageSize(Number(event.target.value))}><option value="10">10 rows</option><option value="25">25 rows</option><option value="50">50 rows</option><option value="100">100 rows</option></Select><Button size="sm" variant="outline" disabled={masterPage <= 1} onClick={(event) => { event.stopPropagation(); setMasterPage((page) => page - 1); }}>Previous</Button><span>Page {masterPage} of {masterPageCount}</span><Button size="sm" variant="outline" disabled={masterPage >= masterPageCount} onClick={(event) => { event.stopPropagation(); setMasterPage((page) => page + 1); }}>Next</Button></div></div>
    </Card>
    {masterContext && <div role="menu" aria-label="Vehicle actions" onClick={(event) => event.stopPropagation()} className="fixed z-[100] min-w-64 overflow-hidden rounded-lg border border-slate-200 bg-surface py-1 shadow-xl" style={{ left: Math.min(masterContext.x, window.innerWidth - 280), top: Math.min(masterContext.y, window.innerHeight - 180) }}><div className="border-b border-slate-100 px-3 py-2"><p className="text-xs font-semibold">{masterContext.vehicle.brand || 'Vehicle'} {masterContext.vehicle.model && masterContext.vehicle.model !== '-' ? masterContext.vehicle.model : masterContext.vehicle.description || ''}</p><p className="text-[11px] text-slate-500">{masterContext.vehicle.plateNo || 'No plate'} · Master ID {masterContext.vehicle.id}</p></div><button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openMasterSchedule(masterContext.vehicle, 'Preventive Maintenance')}><Wrench className="h-4 w-4" /> Add Preventive Maintenance</button><button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openMasterSchedule(masterContext.vehicle, 'Registration Renewal')}><CalendarRange className="h-4 w-4" /> Add Registration Renewal</button><button role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => openMasterInspection(masterContext.vehicle)}><ClipboardCheck className="h-4 w-4" /> Record Inspection</button></div>}
    <Dialog open={Boolean(masterDetailVehicle)} onClose={() => setMasterDetailVehicle(null)} title={`${masterDetailVehicle?.brand && masterDetailVehicle.brand !== '-' ? masterDetailVehicle.brand : 'Vehicle'} ${masterDetailVehicle?.model && masterDetailVehicle.model !== '-' ? masterDetailVehicle.model : masterDetailVehicle?.description ?? ''}`} description={`${masterDetailVehicle?.plateNo ?? 'No plate'} · Master ID ${masterDetailVehicle?.id ?? ''}`} size="xl" footer={<Button onClick={() => setMasterDetailVehicle(null)}>Close</Button>}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Vehicle information" className="flex gap-1 border-b border-slate-200">
          {([['details', 'Vehicle Details'], ['schedules', `Preventive Maintenance Schedules (${masterActivity.schedules.filter((schedule) => schedule.type === 'Preventive Maintenance').length})`], ['renewals', `Registration Renewal Schedules (${masterActivity.schedules.filter((schedule) => schedule.type === 'Registration Renewal').length})`], ['history', `History (${masterActivity.inspections.length})`]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={masterDetailTab === value} onClick={() => setMasterDetailTab(value)} className={`border-b-2 px-4 py-2 text-sm font-semibold ${masterDetailTab === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
        </div>
        {masterDetailTab === 'details' && masterDetailVehicle && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[['Vehicle No.', masterDetailVehicle.vehicleNo], ['Plate No.', masterDetailVehicle.plateNo], ['Brand', masterDetailVehicle.brand], ['Model', masterDetailVehicle.model], ['Description', masterDetailVehicle.description], ['Year Model', masterDetailVehicle.yearModel], ['Vehicle Type', masterDetailVehicle.vehicleType], ['Driver / Assignee', masterDetailVehicle.driver], ['Department', masterDetailVehicle.department], ['Fuel Type', masterDetailVehicle.fuelType], ['Engine No.', masterDetailVehicle.engineNo], ['Chassis No.', masterDetailVehicle.chassisNo], ['Acquired Date', displayDate(masterDetailVehicle.acquiredDate)], ['Acquisition Cost', masterDetailVehicle.acquiredCost], ['Status', masterDetailVehicle.status]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{String(value || '—')}</p></div>)}
          <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Remarks</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{masterDetailVehicle.remarks || '—'}</p></div>
        </div>}
        {masterDetailTab !== 'details' && masterActivityLoading && <div className="p-10 text-center text-sm text-slate-500">Loading vehicle records…</div>}
        {masterDetailTab !== 'details' && masterActivityError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{masterActivityError}</div>}
        {masterDetailTab === 'schedules' && !masterActivityLoading && !masterActivityError && (masterActivity.schedules.some((schedule) => schedule.type === 'Preventive Maintenance') ? <div className="overflow-hidden rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Start</th><th className="px-3 py-2 text-left">End</th><th className="px-3 py-2 text-left">Actual Maintenance Date</th><th className="px-3 py-2 text-left">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{masterActivity.schedules.filter((schedule) => schedule.type === 'Preventive Maintenance').map((schedule) => <tr key={schedule.id}><td className="px-3 py-3">{displayDate(schedule.startDate)}</td><td className="px-3 py-3">{displayDate(schedule.endDate)}</td><td className="px-3 py-3"><Input type="date" value={schedule.actualDate ?? ''} onChange={(event) => void changePreventiveMaintenance(schedule.id, { actualDate: event.target.value })} /></td><td className="px-3 py-3"><Select value={schedule.status} onChange={(event) => void changePreventiveMaintenance(schedule.id, { status: event.target.value as 'Scheduled' | 'Completed' })}><option value="Scheduled">Scheduled</option><option value="Completed">Completed</option></Select></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">No preventive maintenance schedules recorded for this vehicle.</div>)}
        {masterDetailTab === 'renewals' && !masterActivityLoading && !masterActivityError && (masterActivity.schedules.some((schedule) => schedule.type === 'Registration Renewal') ? <div className="overflow-hidden rounded-lg border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">Schedule</th><th className="px-3 py-2 text-left">Start</th><th className="px-3 py-2 text-left">End</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Official Receipt</th></tr></thead><tbody className="divide-y divide-slate-100">{masterActivity.schedules.filter((schedule) => schedule.type === 'Registration Renewal').map((schedule) => <tr key={schedule.id}><td className="px-3 py-3 font-medium">{schedule.type}</td><td className="px-3 py-3">{displayDate(schedule.startDate)}</td><td className="px-3 py-3">{displayDate(schedule.endDate)}</td><td className="px-3 py-3"><Select className="w-32" aria-label="Registration renewal status" value={schedule.status} onChange={(event) => void changeRenewalStatus(schedule.id, event.target.value as 'Scheduled' | 'In Progress' | 'Registered')}><option>Scheduled</option><option>In Progress</option><option>Registered</option></Select></td><td className="px-3 py-3 text-right"><Button size="sm" variant="outline" onClick={() => void openRenewalReceipt(schedule)}>Receipt Details</Button></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">No registration renewal schedules recorded for this vehicle.</div>)}
        {masterDetailTab === 'history' && !masterActivityLoading && !masterActivityError && (masterActivity.inspections.length ? <div className="space-y-3">{masterActivity.inspections.map((inspection) => <button type="button" key={inspection.id} onClick={() => void editMasterInspection(inspection.id)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><div><p className="font-semibold">Vehicle Inspection · {displayDate(inspection.date)}</p><p className="text-xs text-slate-500">Inspected by {inspection.inspectedBy || '—'} · Click to view or edit this inspection</p></div><div className="flex items-center gap-2"><Badge>{inspection.status}</Badge><Pencil className="h-4 w-4 text-slate-400" /></div></button>)}</div> : <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">No inspection history recorded for this vehicle.</div>)}
      </div>
    </Dialog>
    <Dialog open={Boolean(renewalReceiptSchedule)} onClose={() => { if (!renewalReceiptLoading) setRenewalReceiptSchedule(null); }} title="Official Receipt Details" description={`${masterDetailVehicle?.plateNo ?? 'Vehicle'} · ${renewalReceiptSchedule ? `${displayDate(renewalReceiptSchedule.startDate)} to ${displayDate(renewalReceiptSchedule.endDate)}` : ''}`} size="lg" footer={<div className="flex w-full items-center justify-between gap-2"><div>{renewalReceiptExists && <Button variant="destructive" disabled={renewalReceiptLoading} onClick={() => setRenewalReceiptDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete Receipt Details</Button>}</div><div className="flex gap-2"><Button variant="outline" disabled={renewalReceiptLoading} onClick={() => setRenewalReceiptSchedule(null)}>Cancel</Button><Button disabled={renewalReceiptLoading} onClick={() => void saveRenewalReceiptDetails()}>{renewalReceiptLoading ? 'Saving…' : 'Save Receipt Details'}</Button></div></div>}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Official Receipt No."><Input value={renewalReceiptForm.orNumber ?? ''} onChange={(event) => setRenewalReceiptForm((current) => ({ ...current, orNumber: event.target.value }))} /></Field><Field label="Receipt Date"><Input type="date" value={renewalReceiptForm.receiptDate ?? ''} onChange={(event) => setRenewalReceiptForm((current) => ({ ...current, receiptDate: event.target.value }))} /></Field><Field label="Amount Paid"><Input type="number" min="0" step="0.01" value={renewalReceiptForm.amountPaid ?? ''} onChange={(event) => setRenewalReceiptForm((current) => ({ ...current, amountPaid: event.target.value === '' ? undefined : Number(event.target.value) }))} /></Field><Field label="Issuing Office / Payee"><Input value={renewalReceiptForm.issuingOffice ?? ''} onChange={(event) => setRenewalReceiptForm((current) => ({ ...current, issuingOffice: event.target.value }))} /></Field><div className="sm:col-span-2"><Label>Official Receipt Attachment</Label><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.bmp,application/pdf,image/png,image/jpeg,image/bmp" onChange={(event) => setRenewalReceiptFile(event.target.files?.[0])} /><p className="mt-1 text-xs text-slate-500">PDF, PNG, JPG/JPEG, or BMP. {renewalReceiptForm.attachment?.name ? `Current: ${renewalReceiptForm.attachment.name}` : 'No file attached.'}</p>{renewalReceiptForm.attachment?.name && renewalReceiptSchedule && <Button className="mt-2" size="sm" variant="outline" onClick={() => void downloadFleetRenewalReceiptAttachment(token!, renewalReceiptSchedule.id, renewalReceiptForm.attachment!.name)}><FileDown className="h-4 w-4" /> Download Current Attachment</Button>}</div></div>
    </Dialog>
    <ConfirmDialog open={renewalReceiptDeleteOpen} onClose={() => setRenewalReceiptDeleteOpen(false)} onConfirm={() => void deleteRenewalReceiptDetails()} title="Delete official receipt details?" description="This permanently removes the official receipt information and attached file from Oracle. The registration renewal schedule will remain." confirmLabel="Delete Receipt Details" destructive />
    <Dialog open={masterScheduleOpen} onClose={() => { if (!savingMasterAction) setMasterScheduleOpen(false); }} title={`Add ${masterScheduleForm.scheduleType}`} description={`${masterActionVehicle?.brand ?? 'Vehicle'} ${masterActionVehicle?.model && masterActionVehicle.model !== '-' ? masterActionVehicle.model : masterActionVehicle?.description ?? ''} · ${masterActionVehicle?.plateNo ?? 'No plate'} · Master ID ${masterActionVehicle?.id ?? ''}`} footer={<><Button variant="outline" disabled={savingMasterAction} onClick={() => setMasterScheduleOpen(false)}>Cancel</Button><Button disabled={savingMasterAction || !masterScheduleForm.startDate || !masterScheduleForm.endDate} onClick={() => void saveMasterSchedule()}>{savingMasterAction ? 'Saving…' : 'Create Schedule'}</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Schedule Type"><Input value={masterScheduleForm.scheduleType} disabled /></Field><Field label="Status"><Input value="Scheduled" disabled /></Field><Field label="Start Date" required><Input type="date" value={masterScheduleForm.startDate} onChange={(event) => setMasterScheduleForm((current) => ({ ...current, startDate: event.target.value }))} /></Field><Field label="End Date" required><Input type="date" value={masterScheduleForm.endDate} onChange={(event) => setMasterScheduleForm((current) => ({ ...current, endDate: event.target.value }))} /></Field><div className="sm:col-span-2"><Label>Notes</Label><Textarea value={masterScheduleForm.notes} onChange={(event) => setMasterScheduleForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Schedule details or reminders" /></div></div></Dialog>
    <Dialog open={masterInspectionOpen} onClose={() => { if (!savingMasterAction) setMasterInspectionOpen(false); }} title="Record Vehicle Inspection" description={`${masterActionVehicle?.brand ?? 'Vehicle'} ${masterActionVehicle?.model && masterActionVehicle.model !== '-' ? masterActionVehicle.model : masterActionVehicle?.description ?? ''} · ${masterActionVehicle?.plateNo ?? 'No plate'} · Master ID ${masterActionVehicle?.id ?? ''}`} size="xl" footer={<div className="flex w-full items-center justify-between gap-2"><Button type="button" variant="outline" disabled={!masterInspectionItems.length} onClick={() => printMasterInspection()}><Printer className="h-4 w-4" /> Print All Inspections</Button><div className="flex gap-2"><Button variant="outline" disabled={savingMasterAction} onClick={() => setMasterInspectionOpen(false)}>Cancel</Button><Button disabled={savingMasterAction || !masterInspectionForm.inspectionDate || !masterInspectionForm.inspectedBy.trim() || !masterInspectionItems.length} onClick={() => void saveMasterInspection()}>{savingMasterAction ? 'Saving…' : 'Save Inspection'}</Button></div></div>}>
      <div className="space-y-5">
        <div><div className="mb-2 flex items-center justify-between gap-2"><div><h4 className="font-semibold">3D Inspection View</h4><p className="text-xs text-slate-500">Annotations and snapshots are saved against the selected inspection detail.</p></div>{masterInspectionModelUrl && <Button type="button" size="sm" variant="outline" onClick={() => void captureMasterInspectionSnapshot()}><Camera className="h-4 w-4" /> Capture Snapshot</Button>}</div>{masterInspectionModelUrl ? <VehicleModelViewer ref={modelViewerRef} dataUrl={masterInspectionModelUrl} name={`${masterActionVehicle?.brand ?? ''} ${masterActionVehicle?.model ?? ''}`} annotations={masterInspectionItems.find((item) => item.id === activeMasterInspectionItemId)?.annotations ?? []} onAnnotationsChange={(annotations) => activeMasterInspectionItemId && updateMasterInspectionItem(activeMasterInspectionItemId, { annotations })} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500"><Car className="mx-auto mb-2 h-8 w-8 text-slate-300" />No matching GLB is attached in the Vehicle Model Library for this brand and model.</div>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Inspection Date" required><Input type="date" value={masterInspectionForm.inspectionDate} onChange={(event) => setMasterInspectionForm((current) => ({ ...current, inspectionDate: event.target.value }))} /></Field><Field label="Inspected By" required><Input value={masterInspectionForm.inspectedBy} onChange={(event) => setMasterInspectionForm((current) => ({ ...current, inspectedBy: event.target.value }))} /></Field></div>
        <div className="flex flex-wrap gap-2">{masterInspectionItems.map((item, index) => <Button key={item.id} type="button" size="sm" variant="outline" onClick={() => printMasterInspection([item])}><Printer className="h-4 w-4" /> Print Inspection Detail {index + 1}</Button>)}</div>
        <div className="space-y-3">{masterInspectionItems.map((item, index) => <div key={item.id} onClick={() => setActiveMasterInspectionItemId(item.id)} className={`rounded-xl border p-4 ${activeMasterInspectionItemId === item.id ? 'border-brand-400 ring-1 ring-brand-300' : 'border-slate-200'}`}><div className="mb-3 flex items-center justify-between"><p className="font-semibold">Inspection Detail {index + 1}</p>{masterInspectionItems.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => setMasterInspectionItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Vehicle Part / Activity" required><Select value={item.activity} onChange={(event) => updateMasterInspectionItem(item.id, { activity: event.target.value })}>{inspectionActivities.map((activity) => <option key={activity}>{activity}</option>)}</Select></Field><Field label="Status" required><Select value={item.status} onChange={(event) => updateMasterInspectionItem(item.id, { status: event.target.value })}>{defaultInspectionStatuses.map((status) => <option key={status}>{status}</option>)}</Select></Field><div><Label>Findings</Label><Textarea value={item.findings} onChange={(event) => updateMasterInspectionItem(item.id, { findings: event.target.value })} /></div><div><Label>Action Taken</Label><Textarea value={item.actionTaken} onChange={(event) => updateMasterInspectionItem(item.id, { actionTaken: event.target.value })} /></div><div className="sm:col-span-2"><Label>Recommendation</Label><Textarea value={item.recommendation} onChange={(event) => updateMasterInspectionItem(item.id, { recommendation: event.target.value })} /></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><div className="mb-2 flex items-center justify-between"><Label>3D Snapshot</Label>{item.snapshot && <Button type="button" size="sm" variant="ghost" onClick={() => updateMasterInspectionItem(item.id, { snapshot: undefined })}><Trash2 className="h-4 w-4 text-red-600" /> Remove</Button>}</div>{item.snapshot ? <img src={item.snapshot.dataUrl} alt="Annotated 3D snapshot" className="max-h-52 rounded-lg border object-contain" /> : <div className="rounded-lg border border-dashed p-6 text-center text-xs text-slate-500">Select this detail and capture a snapshot above.</div>}</div><div><Label>Files / Photo Evidence</Label><div className="mt-2 flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50"><ImagePlus className="h-4 w-4" /> Attach Images<input hidden type="file" accept="image/*" multiple onChange={(event) => void readFiles(event.target.files).then((files) => updateMasterInspectionItem(item.id, { photos: [...(item.photos ?? []), ...files] }))} /></label><label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50"><Camera className="h-4 w-4" /> Take Picture<input hidden type="file" accept="image/*" capture="environment" onChange={(event) => void readFiles(event.target.files).then((files) => updateMasterInspectionItem(item.id, { photos: [...(item.photos ?? []), ...files] }))} /></label></div>{(item.photos ?? []).length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{(item.photos ?? []).map((photo, photoIndex) => <div key={`${photo.name}-${photoIndex}`} className="relative overflow-hidden rounded-lg border"><img src={photo.dataUrl} alt={photo.name} className="h-28 w-full object-cover" /><button type="button" onClick={() => updateMasterInspectionItem(item.id, { photos: (item.photos ?? []).filter((_, currentIndex) => currentIndex !== photoIndex) })} className="absolute right-1 top-1 rounded bg-black/70 p-1 text-white hover:bg-red-600"><Trash2 className="h-3.5 w-3.5" /></button><p className="truncate px-2 py-1 text-[10px] text-slate-500">{photo.name}</p></div>)}</div>}</div></div></div>)}</div>
        <Button type="button" variant="outline" onClick={() => { const item = newInspectionEntry(); setMasterInspectionItems((current) => [...current, item]); setActiveMasterInspectionItemId(item.id); }}><Plus className="h-4 w-4" /> Add Inspection Detail</Button>
      </div>
    </Dialog>
    <div className="hidden">
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
    <Dialog open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Vehicle Fleet Schedule Summary" description="Oracle vehicle master with preventive maintenance and registration renewal schedules." size="2xl" fixedHeight contentOverflowHidden footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><div className="flex gap-2"><Button variant="outline" onClick={printFleetSummary}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={exportFleetSummary}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button></div><Button onClick={() => setSummaryOpen(false)}>Close</Button></div>}>
      {summaryScheduleLoading ? <div className="p-10 text-center text-sm text-slate-500">Loading the Oracle fleet schedule summary…</div> : summaryVehicles.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center text-sm text-slate-500">No vehicles registered.</div> : <div className="h-full overflow-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1080px] text-sm"><thead className="sticky top-0 z-10 bg-slate-50 shadow-sm"><tr><th className="w-12 px-3 py-2 text-left">No.</th><th className="px-3 py-2 text-left"><SummarySortButton label="Vehicle" sortKey="vehicle" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Plate No." sortKey="plate" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Driver" sortKey="driver" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Department" sortKey="department" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Vehicle Type" sortKey="type" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Preventive Maintenance Schedule" sortKey="preventive" sort={summarySort} onSort={toggleSummarySort} /></th><th className="px-3 py-2 text-left"><SummarySortButton label="Registration Renewal Schedule" sortKey="registration" sort={summarySort} onSort={toggleSummarySort} /></th></tr></thead><tbody className="divide-y divide-slate-100">{summaryVehicles.map((vehicle, index) => { const row = fleetSummaryRow(vehicle); return <tr key={vehicle.id}><td className="px-3 py-3 text-slate-500">{index + 1}</td><td className="px-3 py-3 font-medium">{row.vehicle}</td><td className="px-3 py-3">{row.plate}</td><td className="px-3 py-3">{row.driver}</td><td className="px-3 py-3">{assignmentDepartments.find((department) => department.id === row.department)?.name ?? row.department}</td><td className="px-3 py-3">{row.type}</td><td className="px-3 py-3 text-xs text-slate-600">{row.preventive}</td><td className="px-3 py-3 text-xs text-slate-600">{row.registration}</td></tr>; })}</tbody></table></div>}
    </Dialog>
    <Dialog contentOverflowHidden fixedHeight open={modelLibraryOpen} onClose={() => { if (!savingModelLibrary) setModelLibraryOpen(false); }} title="Vehicle Model Library" description="Add shared brand-model entries and manage the existing library." size="lg" footer={<><Button variant="outline" disabled={savingModelLibrary} onClick={() => setModelLibraryOpen(false)}>Close</Button><Button disabled={savingModelLibrary || !modelLibraryForm.brand.trim() || !modelLibraryForm.model.trim() || !modelLibraryFile} onClick={() => void saveModelLibraryItem()}>{savingModelLibrary ? 'Uploading…' : 'Add Vehicle Model'}</Button></>}>
      <div className="flex h-full min-h-0 flex-col gap-5"><div className="shrink-0 grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><Field label="Vehicle Type"><Select value={modelLibraryForm.type} onChange={(event) => setModelLibraryForm({ ...modelLibraryForm, type: event.target.value })}>{vehicleModelTypes.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Brand" required><Input value={modelLibraryForm.brand} onChange={(event) => setModelLibraryForm({ ...modelLibraryForm, brand: event.target.value })} placeholder="e.g. ISUZU" /></Field><Field label="Model" required><Input value={modelLibraryForm.model} onChange={(event) => setModelLibraryForm({ ...modelLibraryForm, model: event.target.value })} placeholder="e.g. MUX" /></Field><div><Label required>3D Model (GLB)</Label><Input ref={modelLibraryInputRef} type="file" accept=".glb,model/gltf-binary" onChange={(event) => setModelLibraryFile(event.target.files?.[0])} /></div></div><div className="flex min-h-0 flex-1 flex-col"><div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2"><div><h4 className="font-semibold">Available Brand-Models</h4><p className="text-xs text-slate-500">{filteredVehicleModels.length} of {vehicleModels.length} models</p></div><Field label="Filter by Vehicle Type"><Select className="w-52" value={modelLibraryTypeFilter} onChange={(event) => setModelLibraryTypeFilter(event.target.value)}><option value="ALL">All vehicle types</option>{vehicleModelTypes.map((value) => <option key={value}>{value}</option>)}</Select></Field></div>{vehicleModels.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No shared vehicle models yet.</div> : filteredVehicleModels.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">No brand-model entries match this vehicle type.</div> : <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-lg border border-slate-200">{filteredVehicleModels.map((item) => <button type="button" key={item.id} onClick={() => editModelLibraryItem(item)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><div><p className="font-medium">{item.brand} {item.model}</p><p className="text-xs text-slate-500">{item.type} · {item.model3d ? `${item.model3d.name}${item.model3d.size ? ` · ${(item.model3d.size / 1024 / 1024).toFixed(1)} MB` : ''}` : 'No GLB attached'}</p></div><span className="flex items-center gap-2"><Badge>{item.model3d ? 'Shared GLB' : 'Catalog'}</Badge><Pencil className="h-4 w-4 text-slate-400" /></span></button>)}</div>}</div></div>
    </Dialog>
    <Dialog open={Boolean(editingModelLibraryId)} onClose={() => { if (!savingModelLibrary) setEditingModelLibraryId(null); }} title="Edit Vehicle Model" description={`Update ${vehicleModels.find((item) => item.id === editingModelLibraryId)?.brand ?? ''} ${vehicleModels.find((item) => item.id === editingModelLibraryId)?.model ?? ''}.`} size="md" footer={<div className="flex w-full items-center justify-between gap-2"><Button variant="destructive" disabled={savingModelLibrary} onClick={() => setModelLibraryDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete</Button><div className="flex gap-2"><Button variant="outline" disabled={savingModelLibrary} onClick={() => setEditingModelLibraryId(null)}>Cancel</Button><Button disabled={savingModelLibrary || !editingModelLibraryForm.brand.trim() || !editingModelLibraryForm.model.trim()} onClick={() => void saveEditedModelLibraryItem()}>{savingModelLibrary ? 'Saving…' : 'Save Changes'}</Button></div></div>}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Vehicle Type"><Select value={editingModelLibraryForm.type} onChange={(event) => setEditingModelLibraryForm({ ...editingModelLibraryForm, type: event.target.value })}>{vehicleModelTypes.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label="Brand" required><Input value={editingModelLibraryForm.brand} onChange={(event) => setEditingModelLibraryForm({ ...editingModelLibraryForm, brand: event.target.value })} /></Field><Field label="Model" required><Input value={editingModelLibraryForm.model} onChange={(event) => setEditingModelLibraryForm({ ...editingModelLibraryForm, model: event.target.value })} /></Field><div><Label>Replace 3D Model (GLB)</Label><Input ref={editingModelLibraryInputRef} type="file" accept=".glb,model/gltf-binary" onChange={(event) => setEditingModelLibraryFile(event.target.files?.[0])} /><p className="mt-1 text-xs text-slate-500">Leave empty to retain the current shared GLB.</p></div></div>
    </Dialog>
    <ConfirmDialog open={modelLibraryDeleteOpen} onClose={() => setModelLibraryDeleteOpen(false)} onConfirm={() => void deleteModelLibraryItem()} title="Delete Vehicle Model?" description={`Remove ${vehicleModels.find((item) => item.id === editingModelLibraryId)?.brand ?? 'this'} ${vehicleModels.find((item) => item.id === editingModelLibraryId)?.model ?? 'model'} from the library${vehicles.some((vehicle) => vehicle.modelLibraryId === editingModelLibraryId) ? ' and unlink it from assigned fleet records' : ''}? Vehicle records will be retained.`} confirmLabel={savingModelLibrary ? 'Deleting…' : 'Delete Model'} destructive />
    <Dialog open={vehicleOpen} onClose={() => { if (!savingVehicle) setVehicleOpen(false); }} title={editingVehicleId ? 'Edit Vehicle' : 'Add Vehicle'} description={editingVehicleId ? 'Update vehicle assignment, identity, registration, and operating details.' : 'Register a car, truck, motorcycle, or other fleet asset.'} size="lg" footer={<div className="flex w-full items-center justify-between gap-2">{editingVehicleId ? <Button variant="destructive" disabled={savingVehicle} onClick={() => setVehicleDeleteOpen(true)}>Delete Vehicle</Button> : <span />}<div className="flex gap-2"><Button variant="outline" disabled={savingVehicle} onClick={() => setVehicleOpen(false)}>Cancel</Button><Button disabled={savingVehicle || !vehicleForm.brand || !vehicleForm.model || !vehicleForm.plateNumber} onClick={() => void saveVehicle()}>{savingVehicle ? 'Saving…' : editingVehicleId ? 'Save Changes' : 'Save Vehicle'}</Button></div></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle Type"><Select value={vehicleForm.type} disabled={Boolean(vehicleForm.modelLibraryId)} onChange={(e) => setVehicleForm({...vehicleForm,type:e.target.value})}>{['Car','Truck','Motorcycle','Van','Bus','Utility Vehicle','Heavy Equipment','Other'].map(v=><option key={v}>{v}</option>)}</Select></Field>
        <Field label="Plate Number" required><Input value={vehicleForm.plateNumber} onChange={(e)=>setVehicleForm({...vehicleForm,plateNumber:e.target.value})}/></Field>
        <Field label="Brand" required><Select value={vehicleForm.brand} onChange={(event) => setVehicleForm({ ...vehicleForm, modelLibraryId: '', brand: event.target.value, model: '', type: vehicleModels.find((item) => item.brand === event.target.value)?.type ?? vehicleForm.type })}><option value="">Select brand</option>{vehicleForm.brand && !modelLibraryBrands.includes(vehicleForm.brand) && <option value={vehicleForm.brand}>{vehicleForm.brand} — legacy</option>}{modelLibraryBrands.map((brand) => <option key={brand}>{brand}</option>)}</Select></Field>
        <Field label="Model" required><Select value={vehicleForm.modelLibraryId} disabled={!vehicleForm.brand} onChange={(event) => { const item = vehicleModels.find((model) => model.id === event.target.value); if (item) setVehicleForm({ ...vehicleForm, modelLibraryId: item.id, brand: item.brand, model: item.model, type: item.type }); }}><option value="">{vehicleForm.model && !vehicleForm.modelLibraryId ? `${vehicleForm.model} — legacy` : 'Select model'}</option>{modelsForSelectedBrand.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}</Select></Field>
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
        <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3"><Label>Shared 3D Vehicle Model</Label><p className="mt-1 text-sm text-slate-600">{vehicleForm.modelLibraryId ? (vehicleModels.find((item) => item.id === vehicleForm.modelLibraryId)?.model3d?.name ? `${vehicleModels.find((item) => item.id === vehicleForm.modelLibraryId)?.model3d?.name} from the Vehicle Model Library` : 'This catalog entry does not have a GLB attached yet.') : vehicleModel3d ? `${vehicleModel3d.name} — legacy vehicle-specific model` : 'Select a Brand and Model above. Its shared GLB will be used automatically when available.'}</p></div>
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
function MasterSortButton({ label, sortKey, sort, onSort }: { label: string; sortKey: MasterSortKey; sort: { key: MasterSortKey; direction: 'asc' | 'desc' }; onSort: (key: MasterSortKey) => void }) {
  const Icon = sort.key !== sortKey ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const nextDirection = sort.key === sortKey && sort.direction === 'asc' ? 'descending' : 'ascending';
  return <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`Sort ${label} ${nextDirection}`} aria-pressed={sort.key === sortKey}>{label}<Icon className="h-3.5 w-3.5" /></button>;
}
