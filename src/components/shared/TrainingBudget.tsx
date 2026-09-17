import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchTrainingSeminars, type TrainingSeminar } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { formatDate } from '@/lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Toolbar } from './Toolbar';

const money = (value: number | null) => value == null ? '—' : value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type BudgetRow = TrainingSeminar & { balance: number | null };
const columns: Column<BudgetRow>[] = [
  { key: 'name', header: 'Training / Seminar', sortable: true, render: (row) => row.name },
  { key: 'dateFrom', header: 'Start Date', sortable: true, render: (row) => row.dateFrom ? formatDate(row.dateFrom) : '—' },
  { key: 'status', header: 'Status', sortable: true, render: (row) => row.status || '—' },
  { key: 'budgetCost', header: 'Budget Cost', sortable: true, render: (row) => money(row.budgetCost) },
  { key: 'programCost', header: 'Actual Cost Incurred', sortable: true, render: (row) => money(row.programCost) },
  { key: 'balance', header: 'Budget − Actual', sortable: true, render: (row) => <span className={row.balance != null && row.balance < 0 ? 'text-red-600' : ''}>{money(row.balance)}</span> },
];
export function TrainingBudget() {
  const { token } = useAuth();
  const [programs, setPrograms] = useState<TrainingSeminar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [year, setYear] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setLoading(false); setError('Sign in to view budgets.'); return; }
    fetchTrainingSeminars(token).then((result) => { if (!cancelled) setPrograms(result.programs); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load budgets.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  const years = [...new Set(programs.flatMap((row) => row.dateFrom ? [row.dateFrom.slice(0, 4)] : []))].sort().reverse();
  const rows: BudgetRow[] = programs.filter((row) => !year || (year === 'undated' ? !row.dateFrom : row.dateFrom?.startsWith(`${year}-`)))
    .map((row) => ({ ...row, balance: row.budgetCost == null || row.programCost == null ? null : row.budgetCost - row.programCost }));
  const table = useTableControls(rows, (row, query) => `${row.name} ${row.status ?? ''}`.toLowerCase().includes(query), 20);
  return <Card><CardHeader><CardTitle>Training Budget</CardTitle><p className="mt-1 text-sm text-slate-500">Budget and actual costs from training programs. Edit amounts from the Programs tab.</p></CardHeader><CardContent>
    {loading ? <p role="status">Loading training budgets…</p> : error ? <div role="alert"><p>{error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">{[['Budget Cost', 'budgetCost'], ['Actual Cost Incurred', 'programCost']].map(([label, key]) => { const values = rows.map((row) => row[key as 'budgetCost' | 'programCost']).filter((value): value is number => value != null); return <div key={key} className="rounded border border-slate-200 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-semibold">{values.length ? money(values.reduce((sum, value) => sum + value, 0)) : '—'}</p><p className="text-xs text-slate-500">{values.length} of {rows.length} sessions have amounts entered</p></div>; })}</div>
      <Toolbar search={table.search} onSearchChange={table.setSearch} placeholder="Search training or status…" onPrint={() => window.print()}><label className="flex items-center gap-2 text-sm">Year<Select className="w-36" value={year} onChange={(event) => { setYear(event.target.value); table.setPage(1); }}><option value="">All Years</option>{years.map((value) => <option key={value}>{value}</option>)}<option value="undated">No start date</option></Select></label></Toolbar>
      <p className="mb-3 text-xs text-slate-500">Totals follow the selected year. Blank amounts are not treated as zero; budget differences appear only when both amounts are entered.</p>
      <DataTable columns={columns} rows={table.pageRows} getRowId={(row) => row.id} cardTitle={(row) => row.name} sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} emptyTitle="No training budgets found" />
      <Pagination page={table.page} pageCount={table.pageCount} onChange={table.setPage} total={table.filteredCount} pageSize={20} />
    </>}
  </CardContent></Card>;
}
