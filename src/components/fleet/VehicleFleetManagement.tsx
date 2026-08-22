import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CalendarRange, Camera, Car, ClipboardCheck, ExternalLink, FileArchive, Gauge, Plus, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { fetchFleetVehicles, fetchOrgStructure, saveFleetVehicles, type OrgDepartment } from '@/lib/api';

type FleetFile = { name: string; type: string; dataUrl: string };
type CheckItem = { id: string; label: string; checked: boolean; notes: string; photos: FleetFile[] };
export type FleetSchedule = { id: string; type: 'Inspection' | 'Maintenance' | 'Preventive Maintenance' | 'Registration Renewal'; startDate: string; endDate: string; status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue'; checklist: CheckItem[]; documents: FleetFile[] };
export type FleetVehicle = { id: string; type: string; brand: string; model: string; yearAcquired: string; plateNumber: string; propertyNumber: string; color: string; fuel: string; odometer: string; custodian: string; assignedDepartment?: string; assignedOffice: string; acquisitionCost: string; registrationExpiry: string; notes: string; image?: FleetFile; schedules: FleetSchedule[] };
type Schedule = FleetSchedule;

export const FLEET_STORAGE_KEY = 'bes:vehicle-fleet:v1';
const today = new Date().toISOString().slice(0, 10);
const defaultChecks = ['Engine oil and fluid levels', 'Tires, wheels, and spare tire', 'Brakes and parking brake', 'Lights, signals, and horn', 'Battery and electrical system', 'Steering and suspension', 'Safety equipment and first-aid kit', 'Body, glass, and visible damage', 'Odometer and service interval'];
const emptyVehicle = { type: 'Car', brand: '', model: '', yearAcquired: '', plateNumber: '', propertyNumber: '', color: '', fuel: 'Gasoline', odometer: '', custodian: '', assignedDepartment: 'ISD', assignedOffice: 'General Services Office', acquisitionCost: '', registrationExpiry: '', notes: '' };

export function loadFleetVehicles(): FleetVehicle[] {
  try { return JSON.parse(localStorage.getItem(FLEET_STORAGE_KEY) || '[]') as FleetVehicle[]; } catch { return []; }
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
  const { departments } = useData();
  const { token } = useAuth();
  const [orgDepartments, setOrgDepartments] = useState<OrgDepartment[]>([]);
  const [oracleReady, setOracleReady] = useState(false);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(loadFleetVehicles);
  const [selectedId, setSelectedId] = useState<string>('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleDeleteOpen, setVehicleDeleteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [vehicleImage, setVehicleImage] = useState<FleetFile>();
  const [scheduleForm, setScheduleForm] = useState({ type: 'Inspection' as FleetSchedule['type'], startDate: today, endDate: today });
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId) ?? vehicles[0];
  const schedules = vehicles.flatMap((vehicle) => vehicle.schedules);
  const completed = schedules.filter((schedule) => schedule.status === 'Completed').length;
  const due = schedules.filter((schedule) => schedule.status !== 'Completed' && schedule.endDate >= today).length;
  const overdue = schedules.filter((schedule) => schedule.status !== 'Completed' && schedule.endDate < today).length;
  const compliance = schedules.length ? Math.round((completed / schedules.length) * 100) : 0;
  const assignmentDepartments = useMemo(() => orgDepartments.length
    ? orgDepartments.map((department) => ({ id: department.code, name: department.name, shortName: department.code, units: department.offices.map((office) => office.name) }))
    : departments.map((department) => ({ id: department.id, name: department.name, shortName: department.shortName, units: department.units })), [departments, orgDepartments]);

  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    fetchOrgStructure(token).then((result) => { if (!cancelled) setOrgDepartments(result); }).catch(() => { /* keep the offline fallback */ });
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
          localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(serverVehicles));
        }
        setOracleReady(true);
      })
      .catch((error) => console.warn('Unable to load Oracle fleet data; keeping the local copy.', error));
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !oracleReady) return;
    const timer = window.setTimeout(() => {
      void saveFleetVehicles(token, vehicles).catch((error) => console.warn('Unable to save fleet data to Oracle.', error));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [oracleReady, token, vehicles]);

  function persist(next: FleetVehicle[]) { setVehicles(next); localStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(next)); }
  function updateVehicle(id: string, fn: (vehicle: FleetVehicle) => FleetVehicle) { persist(vehicles.map((vehicle) => vehicle.id === id ? fn(vehicle) : vehicle)); }
  function saveVehicle() {
    if (!vehicleForm.brand.trim() || !vehicleForm.model.trim() || !vehicleForm.plateNumber.trim()) return;
    if (editingVehicleId) {
      updateVehicle(editingVehicleId, (vehicle) => ({ ...vehicle, ...vehicleForm, image: vehicleImage ?? vehicle.image }));
      setVehicleOpen(false); setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined);
      return;
    }
    const vehicle: FleetVehicle = { ...vehicleForm, id: `VEH-${Date.now()}`, image: vehicleImage, schedules: [] };
    persist([...vehicles, vehicle]); setSelectedId(vehicle.id); setVehicleOpen(false); setVehicleForm(emptyVehicle); setVehicleImage(undefined);
  }
  function openAddVehicle() {
    setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined); setVehicleOpen(true);
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
    setVehicleImage(vehicle.image); setVehicleOpen(true);
  }
  function deleteVehicle() {
    if (!editingVehicleId) return;
    const next = vehicles.filter((vehicle) => vehicle.id !== editingVehicleId);
    persist(next); setSelectedId(next[0]?.id ?? ''); setVehicleDeleteOpen(false); setVehicleOpen(false);
    setEditingVehicleId(null); setVehicleForm(emptyVehicle); setVehicleImage(undefined);
  }
  function addSchedule() {
    if (!selected || !scheduleForm.startDate || !scheduleForm.endDate) return;
    const schedule: FleetSchedule = { id: `SCH-${Date.now()}`, ...scheduleForm, status: 'Scheduled', documents: [], checklist: defaultChecks.map((label, index) => ({ id: `CHK-${Date.now()}-${index}`, label, checked: false, notes: '', photos: [] })) };
    updateVehicle(selected.id, (vehicle) => ({ ...vehicle, schedules: [...vehicle.schedules, schedule] })); setScheduleOpen(false);
  }
  async function setImage(event: ChangeEvent<HTMLInputElement>) { setVehicleImage((await readFiles(event.target.files))[0]); }
  async function attachFiles(vehicleId: string, scheduleId: string, files: FileList | null, checkId?: string) {
    const attachments = await readFiles(files);
    updateVehicle(vehicleId, (vehicle) => ({ ...vehicle, schedules: vehicle.schedules.map((schedule) => schedule.id !== scheduleId ? schedule : checkId
      ? { ...schedule, checklist: schedule.checklist.map((item) => item.id === checkId ? { ...item, photos: [...item.photos, ...attachments] } : item) }
      : { ...schedule, documents: [...schedule.documents, ...attachments] }) }));
  }
  function updateCheck(vehicleId: string, scheduleId: string, checkId: string, patch: Partial<CheckItem>) {
    updateVehicle(vehicleId, (vehicle) => ({ ...vehicle, schedules: vehicle.schedules.map((schedule) => schedule.id === scheduleId ? { ...schedule, checklist: schedule.checklist.map((item) => item.id === checkId ? { ...item, ...patch } : item) } : schedule) }));
  }

  const metricCards = useMemo(() => [
    { label: 'Fleet Size', value: vehicles.length, icon: Car, tone: 'text-brand-700 bg-brand-50' },
    { label: 'Due on Schedule', value: due, icon: CalendarRange, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Overdue', value: overdue, icon: Wrench, tone: 'text-red-700 bg-red-50' },
    { label: 'Schedule Compliance', value: `${compliance}%`, icon: Gauge, tone: 'text-emerald-700 bg-emerald-50' },
  ], [vehicles.length, due, overdue, compliance]);

  return <div className="space-y-5">
    <div className="flex justify-end"><Button variant="outline" onClick={() => window.open('/workspace/vehicle-fleet/maintenance-schedule', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Maintenance Schedule <ExternalLink className="h-3.5 w-3.5" /></Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-3 p-4"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div></Card>)}</div>
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <Card className="p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Vehicle Registry</h3><p className="text-xs text-slate-500">All fleet assets · click to edit</p></div><Button size="sm" onClick={openAddVehicle}><Plus className="h-4 w-4" /> Add</Button></div>
        <div className="space-y-2">{vehicles.length === 0 ? <div className="rounded-lg border border-dashed p-7 text-center text-sm text-slate-500"><Car className="mx-auto mb-2 h-8 w-8 text-slate-300" />Add the first vehicle to begin.</div> : vehicles.map((vehicle) => <button key={vehicle.id} onClick={() => openEditVehicle(vehicle)} className={`flex w-full gap-3 rounded-lg border p-3 text-left ${selected?.id === vehicle.id ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>{vehicle.image ? <img src={vehicle.image.dataUrl} className="h-12 w-16 rounded object-cover" /> : <span className="grid h-12 w-16 place-items-center rounded bg-slate-100"><Car className="h-5 w-5 text-slate-400" /></span>}<span className="min-w-0"><span className="block truncate text-sm font-semibold">{vehicle.brand} {vehicle.model}</span><span className="block text-xs text-slate-500">{vehicle.plateNumber} · {vehicle.type}</span><span className="block text-[11px] text-slate-400">Accountable: {vehicle.custodian || 'Unassigned'}</span></span></button>)}</div>
      </Card>
      <Card className="p-5">{!selected ? <div className="py-16 text-center text-slate-500">Select or add a vehicle to manage its operations.</div> : <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold">{selected.brand} {selected.model}</h3><Badge>{selected.plateNumber}</Badge></div><p className="text-sm text-slate-500">{selected.type} · Acquired {selected.yearAcquired || '—'} · {selected.fuel} · {selected.odometer || '0'} km</p><p className="mt-1 text-xs text-slate-500">Accountable person: {selected.custodian || 'Unassigned'} · {assignmentDepartments.find((department) => department.id === selected.assignedDepartment)?.shortName ?? selected.assignedDepartment ?? 'ISD'} / {selected.assignedOffice || 'Department Level / No Office'}</p></div><Button onClick={() => setScheduleOpen(true)}><CalendarRange className="h-4 w-4" /> Add Schedule</Button></div>
        <div className="grid gap-2 sm:grid-cols-3"><Info label="Property No." value={selected.propertyNumber}/><Info label="Registration Expiry" value={selected.registrationExpiry}/><Info label="Color" value={selected.color}/></div>
        <div><h4 className="mb-2 flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4" /> Inspections & Maintenance</h4>{selected.schedules.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No schedules yet. Add a date range for an inspection, maintenance activity, or registration renewal.</div> : <div className="space-y-3">{selected.schedules.map((schedule) => { const checked = schedule.checklist.filter((item) => item.checked).length; return <div key={schedule.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{schedule.type}</p><p className="text-xs text-slate-500">{schedule.startDate} to {schedule.endDate} · {checked}/{schedule.checklist.length} checks completed</p></div><Select className="w-40" value={schedule.status} onChange={(event) => updateVehicle(selected.id, (vehicle) => ({ ...vehicle, schedules: vehicle.schedules.map((item) => item.id === schedule.id ? { ...item, status: event.target.value as Schedule['status'] } : item) }))}>{['Scheduled','In Progress','Completed','Overdue'].map((status) => <option key={status}>{status}</option>)}</Select></div>
          <div className="space-y-2">{schedule.checklist.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><div className="flex items-start gap-2"><input className="mt-1 h-4 w-4 accent-emerald-700" type="checkbox" checked={item.checked} onChange={(event) => updateCheck(selected.id, schedule.id, item.id, { checked: event.target.checked })}/><div className="flex-1"><p className="text-sm font-medium">{item.label}</p><Input className="mt-2" placeholder="Findings, damage, or repair needed" value={item.notes} onChange={(event) => updateCheck(selected.id, schedule.id, item.id, { notes: event.target.value })}/><label className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-brand-700"><Camera className="h-3.5 w-3.5" /> Add photo evidence<input hidden type="file" accept="image/*" multiple onChange={(event) => void attachFiles(selected.id, schedule.id, event.target.files, item.id)}/></label>{item.photos.length > 0 && <span className="ml-2 text-xs text-slate-500">{item.photos.length} photo(s)</span>}</div></div></div>)}</div>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed px-3 py-2"><span className="flex items-center gap-2 text-sm"><FileArchive className="h-4 w-4 text-slate-500" /> OR/CR, receipts, job orders, and supporting files ({schedule.documents.length})</span><label className="cursor-pointer text-xs font-semibold text-brand-700">Attach files<input hidden type="file" multiple accept="image/*,.pdf" onChange={(event) => void attachFiles(selected.id, schedule.id, event.target.files)}/></label></div>
        </div>})}</div>}</div>
      </div>}</Card>
    </div>
    <Dialog open={vehicleOpen} onClose={() => setVehicleOpen(false)} title={editingVehicleId ? 'Edit Vehicle' : 'Add Vehicle'} description={editingVehicleId ? 'Update vehicle assignment, identity, registration, and operating details.' : 'Register a car, truck, motorcycle, or other fleet asset.'} size="lg" footer={<div className="flex w-full items-center justify-between gap-2">{editingVehicleId ? <Button variant="destructive" onClick={() => setVehicleDeleteOpen(true)}>Delete Vehicle</Button> : <span />}<div className="flex gap-2"><Button variant="outline" onClick={() => setVehicleOpen(false)}>Cancel</Button><Button disabled={!vehicleForm.brand || !vehicleForm.model || !vehicleForm.plateNumber} onClick={saveVehicle}>{editingVehicleId ? 'Save Changes' : 'Save Vehicle'}</Button></div></div>}>
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
        <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={vehicleForm.notes} onChange={(e)=>setVehicleForm({...vehicleForm,notes:e.target.value})}/></div>
      </div>
    </Dialog>
    <ConfirmDialog open={vehicleDeleteOpen} onClose={() => setVehicleDeleteOpen(false)} onConfirm={deleteVehicle} title="Delete Vehicle?" description={`Delete ${vehicleForm.brand} ${vehicleForm.model} (${vehicleForm.plateNumber}) and all of its inspection, maintenance, registration, checklist, and attachment records? This cannot be undone.`} confirmLabel="Delete Vehicle and Records" destructive />
    <Dialog contentOverflowVisible open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Add Fleet Schedule" description={`Create a single-day or date-range schedule for ${selected?.plateNumber ?? 'this vehicle'}.`} footer={<><Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button><Button onClick={addSchedule}>Create Schedule</Button></>}><div className="space-y-4"><Field label="Activity"><Select value={scheduleForm.type} onChange={(e)=>setScheduleForm({...scheduleForm,type:e.target.value as Schedule['type']})}>{['Inspection','Preventive Maintenance','Maintenance','Registration Renewal'].map(v=><option key={v}>{v}</option>)}</Select></Field><DateRangePicker placement="top" required label="Schedule Date / Date Range" startDate={scheduleForm.startDate} endDate={scheduleForm.endDate} onChange={(startDate, endDate) => setScheduleForm((current) => ({ ...current, startDate, endDate }))} /></div></Dialog>
  </div>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div><Label required={required}>{label}</Label>{children}</div>; }
function Info({ label, value }: { label: string; value?: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-sm font-medium">{value || '—'}</p></div>; }
