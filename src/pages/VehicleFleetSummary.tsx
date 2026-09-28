import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { fetchFleetRecords, type FleetVehicleRecord } from '@/lib/api';
import { fleetLabel, summarizeFleet, type FleetGroup } from '@/lib/fleet-summary';

const quantity = (value: number) => value.toLocaleString();
const money = (value: number) => value.toLocaleString('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 });

function Breakdown({ title, description, groups, total, costs = false }: { title: string; description?: string; groups: FleetGroup[]; total: number; costs?: boolean }) {
  return <Card className="min-w-0">
    <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
    <CardContent>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-slate-500"><tr><th scope="col" className="pb-3 pr-3">{title}</th><th scope="col" className="pb-3 px-2 text-right">Qty</th><th scope="col" className="pb-3 px-2 text-right">Share</th>{costs && <th scope="col" className="pb-3 pl-3 text-right">Recorded cost</th>}</tr></thead>
          <tbody>{groups.map((group) => <tr key={group.label} className="border-t border-slate-100">
            <th scope="row" className="py-3 pr-3 font-normal text-slate-800"><span className="break-words">{group.label}</span><div aria-hidden="true" className="mt-2 h-1 w-full min-w-16 rounded bg-slate-100"><div className="h-1 rounded bg-brand-500" style={{ width: `${total ? group.count / total * 100 : 0}%` }} /></div></th>
            <td className="px-2 text-right font-semibold tabular-nums text-slate-800">{quantity(group.count)}</td><td className="px-2 text-right tabular-nums text-slate-500">{total ? (group.count / total * 100).toFixed(1) : '0.0'}%</td>
            {costs && <td className="pl-3 text-right tabular-nums text-slate-800"><span className="whitespace-nowrap">{group.costCount ? money(group.cost) : '—'}</span><span className="block text-xs text-slate-500">{group.costCount} of {group.count} with cost</span></td>}
          </tr>)}</tbody>
        </table>
      </div>
    </CardContent>
  </Card>;
}

export default function VehicleFleetSummary() {
  const { token } = useAuth();
  const [records, setRecords] = useState<FleetVehicleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [type, setType] = useState('');
  const [fuel, setFuel] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setError('Sign in to view the fleet summary.'); setLoading(false); return; }
    fetchFleetRecords(token).then((rows) => { if (!cancelled) setRecords(rows); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load the fleet summary.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, revision]);
  const filtered = useMemo(() => records.filter((row) => (!department || fleetLabel(row.department) === department)
    && (!type || fleetLabel(row.vehicleType) === type) && (!fuel || fleetLabel(row.fuelType) === fuel)
    && (!search.trim() || [row.plateNo, row.vehicleNo, row.brand, row.model, row.description, row.driver].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())))), [records, department, type, fuel, search]);
  const metrics = useMemo(() => summarizeFleet(filtered), [filtered]);
  const options = (field: 'department' | 'vehicleType' | 'fuelType') => [...new Set(records.map((row) => fleetLabel(row[field])))].sort();
  const clearFilters = () => { setSearch(''); setDepartment(''); setType(''); setFuel(''); };
  return <div>
    <PageHeader title="Vehicle Fleet Summary" description="Assignments, acquisition costs, and renewal planning for active vehicles."
      crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'Vehicle Fleet Summary' }]}
      actions={<Button variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>} />
    <Card className="mb-5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-slate-500"><BarChart3 className="h-4 w-4" /> All active vehicle assets · VMS_VEHICLE_MAST</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Input aria-label="Search fleet summary" placeholder="Search plate, brand, driver…" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select aria-label="Summary department" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{options('department').map((value) => <option key={value}>{value}</option>)}</Select>
        <Select aria-label="Summary vehicle type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All vehicle types</option>{options('vehicleType').map((value) => <option key={value}>{value}</option>)}</Select>
        <Select aria-label="Summary fuel type" value={fuel} onChange={(event) => setFuel(event.target.value)}><option value="">All fuel types</option>{options('fuelType').map((value) => <option key={value}>{value}</option>)}</Select>
        <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
      </div>
    </Card>
    {loading ? <p role="status" className="py-12 text-center text-slate-500">Loading fleet summary…</p> : error ? <Card role="alert" className="p-6 text-center"><p className="mb-3 text-red-600">{error}</p><Button onClick={() => setRevision((value) => value + 1)}>Retry</Button></Card> : <>
      <p role="status" className="mb-4 text-xs text-slate-500">{quantity(filtered.length)} of {quantity(records.length)} active vehicle records · All metrics follow the filters above.</p>
      {!filtered.length ? <Card className="p-8 text-center text-slate-500">{records.length ? 'No matching vehicles. Try clearing the filters.' : 'No active vehicle records found.'}</Card> : <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total vehicles', quantity(metrics.total), `${metrics.departments.filter((group) => group.label !== 'Unassigned').length} assigned departments`],
            ['Recorded acquisition cost', metrics.knownCosts ? money(metrics.totalCost) : '—', `${metrics.knownCosts} with cost · ${metrics.total - metrics.knownCosts} missing / invalid`],
            ['Average acquisition cost', metrics.averageCost === null ? '—' : money(metrics.averageCost), 'Across vehicles with a recorded cost, including zero'],
            ['Plates with a numeric digit', quantity(metrics.total - metrics.unknownPlates), `${metrics.unknownPlates} missing / no numeric digit`],
          ].map(([label, value, note]) => <Card key={label} className="p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="my-2 break-words text-2xl font-semibold tabular-nums text-brand-700">{value}</p><p className="text-xs text-slate-500">{note}</p></Card>)}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Breakdown title="Department" description="Vehicles assigned per department, including unassigned records." groups={metrics.departments} total={metrics.total} costs />
          <Breakdown title="Vehicle type" groups={metrics.types} total={metrics.total} />
          <Breakdown title="Brand - Model" description="Grouped by the master record’s brand and model fields." groups={metrics.brands} total={metrics.total} />
          <Breakdown title="Fuel type" groups={metrics.fuels} total={metrics.total} />
          <Breakdown title="Acquisition year" description={`Quantity and recorded cost by acquired date (year). ${metrics.unknownDates} missing or invalid dates.`} groups={metrics.acquisitions} total={metrics.total} costs />
          <Breakdown title="Acquisition cost band" description="Missing or invalid costs are separate from recorded zero costs." groups={metrics.costBands} total={metrics.total} costs />
          <div className="xl:col-span-2"><Breakdown title="Last numeric digit of plate" description="Renewal planning counts use the last digit even when letters follow (108YHS → 8). Unknown means no numeric digit. These are plate counts, not confirmed renewal due dates or completion status." groups={metrics.endings} total={metrics.total} /></div>
        </div>
      </>}
    </>}
  </div>;
}
