import { useEffect, useMemo, useState } from 'react';
import { Building2, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchPlantilla, type PlantillaRow } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Organization2() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PlantillaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!token) { setRows([]); setError('Session required. Please sign in.'); setLoading(false); return; }
    fetchPlantilla(token).then((items) => { if (!cancelled) setRows(items); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load organization.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, revision]);
  const departments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const grouped = new Map<string, { name: string; code: string; rows: PlantillaRow[]; offices: Map<string, { name: string; rows: PlantillaRow[] }> }>();
    for (const row of rows) {
      if (query && ![row.name, row.id, row.deptId, row.officeId, row.groupId, row.departmentName, row.departmentCode, row.officeName].some((value) => value?.toLowerCase().includes(query))) continue;
      const key = row.deptId ?? '';
      let department = grouped.get(key);
      if (!department) {
        department = { name: row.departmentName || (row.deptId ? `Department ${row.deptId}` : 'Unassigned department'), code: row.departmentCode || row.deptId || '', rows: [], offices: new Map() };
        grouped.set(key, department);
      }
      department.rows.push(row);
      const officeKey = row.officeId ?? '';
      let office = department.offices.get(officeKey);
      if (!office) {
        office = { name: row.officeName || (row.officeId ? `Office ${row.officeId}` : 'No office assigned'), rows: [] };
        department.offices.set(officeKey, office);
      }
      office.rows.push(row);
    }
    return [...grouped.entries()];
  }, [rows, search]);
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
      <div><CardTitle>Organization2</CardTitle><p className="mt-1 text-sm text-slate-500">Plantilla positions by department and office.</p></div>
      <Button variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Refresh</Button>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input aria-label="Search plantilla" className="pl-9" placeholder="Search positions, departments, offices, or IDs…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {loading ? <p role="status" className="text-sm text-slate-500">Loading organization…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : <>
        <p className="text-sm text-slate-500">{rows.length} plantilla positions · {departments.length} {search.trim() ? 'matching ' : ''}departments</p>
        {!departments.length && <p className="py-6 text-center text-sm text-slate-500">{search.trim() ? 'No matching positions.' : 'No plantilla positions yet.'}</p>}
        {departments.map(([key, department]) => <details key={`${key}-${search.trim() ? 'search' : 'all'}`} open={search.trim() ? true : undefined} className="rounded-xl border border-slate-200">
          <summary className="cursor-pointer p-4 text-sm font-semibold"><Building2 className="mx-2 inline h-4 w-4 text-brand-600" />{department.name}<span className="ml-2 text-xs font-normal text-slate-500">{department.code} · {department.rows.length} positions</span></summary>
          <div className="space-y-3 border-t border-slate-200 p-4">
            {[...department.offices.entries()].map(([officeKey, office]) => <div key={officeKey} className="overflow-hidden rounded-lg border border-slate-200">
              <div className="bg-slate-50 px-3 py-2 text-sm font-semibold">{office.name}<span className="ml-2 text-xs font-normal text-slate-500">{officeKey} · {office.rows.length} positions</span></div>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="p-3">ID</th><th className="p-3">Plantilla name</th><th className="p-3">Group ID</th></tr></thead><tbody>{office.rows.map((row) => <tr key={row.id} className="border-t border-slate-200"><td className="p-3 text-slate-500">{row.id}</td><td className="p-3">{row.name}</td><td className="p-3">{row.groupId ?? '—'}</td></tr>)}</tbody></table></div>
            </div>)}
          </div>
        </details>)}
      </>}
    </CardContent>
  </Card>;
}
