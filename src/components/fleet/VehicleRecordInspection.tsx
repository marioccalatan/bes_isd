import { useEffect, useRef, useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createFleetMasterInspection, fetchFleetVehicleModel, fetchFleetVehicleModels, type FleetVehicleRecord } from '@/lib/api';
import { VehicleModelViewer, type ModelAnnotation, type VehicleModelViewerHandle } from './VehicleModelViewer';

type Evidence = { name: string; dataUrl: string };
type Detail = { id: string; activity: string; status: string; findings: string; actionTaken: string; recommendation: string; annotations: ModelAnnotation[]; snapshot?: Evidence; photos: Evidence[] };
type LibraryModel = { id: string; brand: string; model: string; model3d?: { name: string } };
const activities = ['General vehicle condition', 'Engine oil and fluid levels', 'Tires, wheels, and spare tire', 'Brakes and parking brake', 'Lights, signals, and horn', 'Battery and electrical system', 'Steering and suspension', 'Safety equipment and first-aid kit', 'Body, glass, and visible damage', 'Odometer and service interval', 'Roadworthiness and test drive', 'Other'];
const newDetail = (): Detail => ({ id: `INSP-ITEM-${crypto.randomUUID()}`, activity: activities[0], status: 'No Problem', findings: '', actionTaken: '', recommendation: '', annotations: [], photos: [] });
const normalize = (value: string | null) => (value ?? '').trim().toLowerCase();

export function VehicleRecordInspection({ vehicle, onClose }: { vehicle: FleetVehicleRecord; onClose: () => void }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [date, setDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  const [inspector, setInspector] = useState(user?.name ?? '');
  const [items, setItems] = useState<Detail[]>(() => [newDetail()]);
  const [activeId, setActiveId] = useState('');
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const [modelUrl, setModelUrl] = useState('');
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState('');
  const [modelAttempt, setModelAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const viewer = useRef<VehicleModelViewerHandle>(null);
  const saveInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let url = '';
    setModelLoading(true); setModelError(''); setModelUrl('');
    async function load() {
      try {
        const models = await fetchFleetVehicleModels<LibraryModel[]>(token);
        const match = models.find((model) => model.model3d && normalize(model.brand) === normalize(vehicle.brand) && normalize(model.model) === normalize(vehicle.model));
        if (!match) return;
        const blob = await fetchFleetVehicleModel(token, match.id);
        if (!cancelled) { url = URL.createObjectURL(blob); setModelUrl(url); }
      } catch (reason) { if (!cancelled) setModelError(reason instanceof Error ? reason.message : 'Unable to load the 3D model.'); }
      finally { if (!cancelled) setModelLoading(false); }
    }
    void load();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [token, vehicle.brand, vehicle.model, modelAttempt]);

  function update(id: string, patch: Partial<Detail>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  async function snapshot() {
    if (!active || !viewer.current) return;
    const id = active.id;
    setCapturing(true); setError('');
    try { const dataUrl = await viewer.current.captureSnapshot(); update(id, { snapshot: { name: `inspection-${date}-${id}.png`, dataUrl } }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Snapshot capture failed.'); }
    finally { setCapturing(false); }
  }
  async function attach(files: FileList | null) {
    if (!files || !active) return;
    const id = active.id;
    setUploading(true); setError('');
    try {
      const photos = await Promise.all(Array.from(files).map((file) => new Promise<Evidence>((resolve, reject) => {
        if (!file.type.startsWith('image/') || file.size > 12_000_000) { reject(new Error('Choose image files no larger than 12 MB each.')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
        reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
        reader.readAsDataURL(file);
      })));
      setItems((current) => current.map((item) => item.id === id ? { ...item, photos: [...item.photos, ...photos] } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to attach images.'); }
    finally { setUploading(false); }
  }
  async function save() {
    if (saveInFlight.current || !date || !inspector.trim() || capturing || uploading) return;
    saveInFlight.current = true; setSaving(true); setError('');
    try {
      const result = await createFleetMasterInspection(token, { vehicleMasterId: vehicle.id, inspectionDate: date, inspectedBy: inspector.trim(), inspectionStatus: items.some((item) => item.status !== 'No Problem') ? 'With Findings' : 'No Problem', items });
      toast({ kind: 'success', title: 'Inspection recorded', description: `${result.inspection.id} and its inspection details and images were saved in Oracle.` });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the inspection.'); }
    finally { saveInFlight.current = false; setSaving(false); }
  }

  return <Dialog open onClose={() => { if (!saving && !capturing && !uploading) onClose(); }} title="Add Vehicle Inspection" description={`${vehicle.brand ?? ''} ${vehicle.model ?? ''} · ${vehicle.plateNo || 'No plate'} · Master ID ${vehicle.id}`} size="2xl" footer={<><Button variant="outline" disabled={saving || capturing || uploading} onClick={onClose}>Cancel</Button><Button disabled={saving || capturing || uploading || !date || !inspector.trim()} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Inspection'}</Button></>}>
    <fieldset disabled={saving} className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="record-inspection-date" required>Inspection Date</Label><Input id="record-inspection-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div><Label htmlFor="record-inspector" required>Inspected By</Label><Input id="record-inspector" value={inspector} onChange={(event) => setInspector(event.target.value)} /></div></div>
      <div className="flex flex-wrap gap-2">{items.map((item, index) => <Button key={item.id} size="sm" variant={active.id === item.id ? 'primary' : 'outline'} onClick={() => setActiveId(item.id)}>Detail {index + 1}</Button>)}<Button size="sm" variant="outline" onClick={() => { const item = newDetail(); setItems((current) => [...current, item]); setActiveId(item.id); }}><Plus className="h-4 w-4" /> Add Detail</Button></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">3D Inspection View</h3><Button size="sm" variant="outline" disabled={!modelUrl || capturing} onClick={() => void snapshot()}><Camera className="h-4 w-4" /> {capturing ? 'Capturing…' : 'Capture Snapshot'}</Button></div><p className="text-xs text-slate-500">Draw findings on the model, then capture an image for Detail {items.indexOf(active) + 1}.</p>
          {modelLoading ? <p role="status" className="py-16 text-center text-sm text-slate-500">Loading vehicle model…</p> : modelError ? <div role="alert" className="rounded-lg border p-6 text-sm"><p>{modelError}</p><Button className="mt-2" variant="outline" onClick={() => setModelAttempt((value) => value + 1)}>Retry 3D Model</Button></div> : modelUrl ? <VehicleModelViewer ref={viewer} dataUrl={modelUrl} name={`${vehicle.brand ?? ''} ${vehicle.model ?? ''}`} annotations={active.annotations} onAnnotationsChange={(annotations) => update(active.id, { annotations })} /> : <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">No GLB is attached for this brand and model in the Vehicle Model Library. You can still record findings and attach photos.</p>}
        </div>
        <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Inspection Detail {items.indexOf(active) + 1}</h3>{items.length > 1 && <Button size="sm" variant="ghost" disabled={capturing || uploading} onClick={() => { setItems((current) => current.filter((item) => item.id !== active.id)); setActiveId(''); }}><Trash2 className="h-4 w-4" /> Remove Detail</Button>}</div>
          <div><Label htmlFor="record-activity">Vehicle Part / Activity</Label><Select id="record-activity" value={active.activity} onChange={(event) => update(active.id, { activity: event.target.value })}>{activities.map((activity) => <option key={activity}>{activity}</option>)}</Select></div>
          <div><Label htmlFor="record-status">Status</Label><Select id="record-status" value={active.status} onChange={(event) => update(active.id, { status: event.target.value })}>{['No Problem', 'For Replacement', 'Schedule Repair'].map((status) => <option key={status}>{status}</option>)}</Select></div>
          {([['findings', 'Findings'], ['actionTaken', 'Action Taken'], ['recommendation', 'Recommendation']] as const).map(([key, label]) => <div key={key}><Label htmlFor={`record-${key}`}>{label}</Label><Textarea id={`record-${key}`} value={active[key]} onChange={(event) => update(active.id, { [key]: event.target.value })} /></div>)}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>3D Snapshot · Detail {items.indexOf(active) + 1}</Label>{active.snapshot ? <div><img src={active.snapshot.dataUrl} alt="Annotated inspection snapshot" className="max-h-52 rounded-lg border object-contain" /><Button size="sm" variant="ghost" onClick={() => update(active.id, { snapshot: undefined })}>Remove Snapshot</Button></div> : <p className="rounded-lg border border-dashed p-5 text-xs text-slate-500">Captured 3D images will appear here and be saved with this detail.</p>}</div><div><Label htmlFor="record-photos">Photo Evidence · Detail {items.indexOf(active) + 1}</Label><Input id="record-photos" type="file" accept="image/*" multiple disabled={uploading} onChange={(event) => { void attach(event.target.files); event.target.value = ''; }} /><div className="mt-2 grid grid-cols-2 gap-2">{active.photos.map((photo, index) => <div key={`${photo.name}-${index}`}><img src={photo.dataUrl} alt={photo.name} className="h-28 w-full rounded border object-contain" /><Button size="sm" variant="ghost" onClick={() => update(active.id, { photos: active.photos.filter((_, photoIndex) => photoIndex !== index) })}>Remove Image {index + 1}</Button></div>)}</div></div></div>
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
  </Dialog>;
}
