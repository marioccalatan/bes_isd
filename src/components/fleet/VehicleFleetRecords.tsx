import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, CalendarRange, ExternalLink, RefreshCw } from 'lucide-react';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/context/AuthContext';
import { fetchFleetRecords, type FleetVehicleRecord } from '@/lib/api';
import { VehicleRecordInspection } from './VehicleRecordInspection';
import { formatDate } from '@/lib/utils';

const display = (value: unknown) => value == null || value === '' || value === '-' ? '—' : String(value);
function vehicleTypeLabel(value: string | null) {
  const type = value?.trim();
  return !type || type === '-' || type === '—' ? 'Unassigned' : type;
}
function displayCost(value: FleetVehicleRecord['acquiredCost']) {
  if (display(value) === '—') return '—';
  const amount = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(amount) ? amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }) : display(value);
}
const fields: Array<[keyof FleetVehicleRecord, string]> = [
  ['vehicleNo', 'Vehicle No.'], ['plateNo', 'Plate No.'], ['brand', 'Brand'], ['model', 'Model'],
  ['description', 'Description'], ['yearModel', 'Year Model'], ['vehicleType', 'Vehicle Type'],
  ['status', 'Status'], ['driver', 'Driver'], ['department', 'Department'], ['fuelType', 'Fuel Type'],
  ['fuelEfficiency', 'Fuel Efficiency'], ['acquiredDate', 'Acquired Date'], ['acquiredCost', 'Acquisition Cost'],
  ['engineNo', 'Engine No.'], ['chassisNo', 'Chassis No.'], ['remarks', 'Remarks'],
];
const pageSize = 20;

export function VehicleFleetRecords() {
  const { token } = useAuth();
  const [records, setRecords] = useState<FleetVehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof FleetVehicleRecord>('plateNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [inspectionVehicle, setInspectionVehicle] = useState<FleetVehicleRecord | null>(null);
  const [contextMenu, setContextMenu] = useState<{ vehicle: FleetVehicleRecord; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<FleetVehicleRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRecords([]);
    if (!token) {
      setError('Sign in to load vehicle records.');
      setLoading(false);
      return;
    }
    fetchFleetRecords(token).then((rows) => {
      if (!cancelled) setRecords(rows);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load vehicle records.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, revision]);

  useEffect(() => {
    if (!contextMenu) return;
    menuRef.current?.querySelector('button')?.focus();
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null); };
    const close = () => setContextMenu(null);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [contextMenu]);

  const departments = [...new Set(records.map((row) => row.department).filter((value): value is string => Boolean(value)))].sort();
  const typeOptions = [...new Set(records.map((row) => vehicleTypeLabel(row.vehicleType)))].sort();
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((row) => (!department || row.department === department)
      && (!query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)))
      && Object.entries(columnFilters).every(([key, value]) => {
        if (!value.trim()) return true;
        if (key === 'vehicleType') return vehicleTypeLabel(row.vehicleType) === value;
        const text = key === 'brand' ? `${display(row.brand)} ${display(row.model)}` : display(row[key as keyof FleetVehicleRecord]);
        return text.toLowerCase().includes(value.trim().toLowerCase());
      }))
      .sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * (sortDir === 'asc' ? 1 : -1));
  }, [records, search, department, columnFilters, sortKey, sortDir]);
  const vehicleTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vehicle of filtered) {
      const type = vehicleTypeLabel(vehicle.vehicleType);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([leftType, leftCount], [rightType, rightCount]) => rightCount - leftCount || leftType.localeCompare(rightType));
  }, [filtered]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const columns: Column<FleetVehicleRecord>[] = [
    { key: 'plateNo', header: 'Plate No.', sortable: true, render: (row) => <button className="font-medium text-brand-700 underline-offset-2 hover:underline" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>{display(row.plateNo)}</button> },
    { key: 'vehicleNo', header: 'Vehicle No.', sortable: true, render: (row) => display(row.vehicleNo) },
    { key: 'brand', header: 'Brand / Model', sortable: true, render: (row) => <div><p className="font-medium">{display(row.brand)}</p><p className="text-xs text-slate-500">{display(row.model)}</p></div> },
    ...(['yearModel', 'vehicleType', 'driver', 'department', 'fuelType'] as const).map((key) => ({ key, header: fields.find(([field]) => field === key)![1], sortable: true, render: (row: FleetVehicleRecord) => display(row[key]) })),
    { key: 'status', header: 'Status', sortable: true, render: (row) => <Badge>{display(row.status)}</Badge> },
  ];
  const filterColumns = columns.map((column) => ({
    ...column,
    filterable: true,
    ...(column.key === 'vehicleType' ? { filterOptions: typeOptions } : {}),
  }));

  return <div>
    {!loading && !error && <section aria-label="Vehicle type summary" className="mb-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
        <h3 className="text-sm font-semibold text-slate-800">Vehicle Type Summary</h3>
        <p className="text-xs text-slate-500">{search.trim() || department || Object.values(columnFilters).some((value) => value.trim()) ? 'Matching active vehicles · All pages' : 'All active vehicles'}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <dt className="text-xs font-medium text-brand-700">Total Vehicles</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-brand-700">{filtered.length.toLocaleString()}</dd>
        </div>
        {vehicleTypes.map(([type, count]) => <div key={type} className="rounded-lg border border-slate-200 bg-surface p-3">
          <dt className="text-xs font-medium text-slate-500">{type}</dt>
          <dd className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums text-slate-800">{count.toLocaleString()}</span><span className="text-xs text-slate-500">{(count / filtered.length * 100).toFixed(1)}%</span></dd>
        </div>)}
      </dl>
    </section>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-500">Source: <span className="font-medium">VMS_VEHICLE_MAST</span> · Active vehicles only</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" title="Open preventive maintenance Gantt chart in a new tab" onClick={() => window.open('/workspace/vehicle-fleet/maintenance-schedule', '_blank', 'noopener,noreferrer')}><CalendarRange className="h-4 w-4" /> Maintenance Schedule <ExternalLink className="h-3.5 w-3.5" /></Button>
        <Button variant="outline" size="sm" disabled={loading} onClick={() => { setPage(1); setRevision((value) => value + 1); }}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </div>
    </div>
    <Toolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search plate, vehicle, driver…">
      <Select aria-label="Filter department" className="w-auto" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}><option value="">All departments</option>{departments.map((value) => <option key={value}>{value}</option>)}</Select>
    </Toolbar>
    {loading ? <p role="status" className="py-10 text-center text-sm text-slate-500">Loading Oracle vehicle records…</p>
      : error ? <div role="alert" className="rounded-lg border border-red-200 p-6 text-center"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" variant="outline" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>
        : <>
          <p className="mb-3 text-xs text-slate-500">{filtered.length} of {records.length} records · Select for details or right-click to add an inspection.</p>
          <DataTable columns={filterColumns} columnFilters={columnFilters} onColumnFilterChange={(key, value) => { setColumnFilters((current) => ({ ...current, [key]: value })); setPage(1); }} rows={filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)} getRowId={(row) => row.id} onRowClick={setSelected} onRowContextMenu={(vehicle, event) => { event.preventDefault(); setContextMenu({ vehicle, x: event.clientX, y: event.clientY }); }} cardTitle={(row) => display(row.plateNo)} minWidthPx={1000} sortKey={sortKey} sortDir={sortDir} onSort={(key) => { setSortKey(key as keyof FleetVehicleRecord); setSortDir(sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'); setPage(1); }} emptyTitle={records.length ? 'No matching vehicles' : 'No vehicle records found'} emptyDescription={records.length ? 'Try another search or filter.' : 'VMS_VEHICLE_MAST contains no active vehicle assets.'} />
          <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} total={filtered.length} pageSize={pageSize} />
        </>}
    {contextMenu && <div ref={menuRef} role="menu" aria-label="Vehicle record actions" className="fixed z-[100] w-60 rounded-lg border border-slate-200 bg-surface p-1 shadow-xl" style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 248)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 110)) }}>
      <p className="truncate border-b border-slate-200 px-3 py-2 text-xs text-slate-500">{display(contextMenu.vehicle.plateNo)} · {display(contextMenu.vehicle.brand)} {display(contextMenu.vehicle.model)}</p>
      <button role="menuitem" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50" onClick={() => { setInspectionVehicle(contextMenu.vehicle); setContextMenu(null); }}><ClipboardCheck className="h-4 w-4" /> Add Inspection</button>
    </div>}
    {inspectionVehicle && <VehicleRecordInspection key={inspectionVehicle.id} vehicle={inspectionVehicle} onClose={() => setInspectionVehicle(null)} />}
    <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} title={`Vehicle — ${display(selected?.plateNo)}`} description="Vehicle master record · VMS_VEHICLE_MAST" size="lg" footer={<><Button variant="outline" onClick={() => { setInspectionVehicle(selected); setSelected(null); }}><ClipboardCheck className="h-4 w-4" /> Add Inspection</Button><Button onClick={() => setSelected(null)}>Close</Button></>}>
      {selected && <dl className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <div key={key} className={key === 'remarks' || key === 'description' ? 'sm:col-span-2' : ''}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{key === 'acquiredDate' ? formatDate(selected.acquiredDate ?? undefined) : key === 'acquiredCost' ? displayCost(selected.acquiredCost) : display(selected[key])}</dd></div>)}</dl>}
    </Dialog>
  </div>;
}
