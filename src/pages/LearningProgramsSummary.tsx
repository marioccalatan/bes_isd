import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { fetchTrainingSeminars, type TrainingSeminar } from '@/lib/api';
import { summarizeTrainings, trainingPeriodMetrics, type TrainingSummaryRow } from '@/lib/trainingSummary';
import { formatDate } from '@/lib/utils';
import { useTableControls } from '@/hooks/useTableControls';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';

const columns: Column<TrainingSummaryRow>[] = [
  { key: 'name', header: 'Unique Training / Seminar', sortable: true, render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
  { key: 'conducted', header: 'Times Conducted', sortable: true, render: (row) => row.conducted.toLocaleString() },
  { key: 'scheduled', header: 'Scheduled', sortable: true, render: (row) => row.scheduled.toLocaleString() },
  { key: 'records', header: 'Total Records', sortable: true, render: (row) => row.records.toLocaleString() },
  { key: 'participantCount', header: 'Qty Participants', sortable: true, render: (row) => row.participantCount.toLocaleString() },
  { key: 'lastConducted', header: 'Latest Conducted Start Date', sortable: true, render: (row) => row.lastConducted ? formatDate(row.lastConducted) : '—' },
];

export default function LearningProgramsSummary() {
  const { token } = useAuth();
  const [programs, setPrograms] = useState<TrainingSeminar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const year = searchParams.get('year') ?? '';
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!token) { setError('Sign in to view the summary.'); setLoading(false); return; }
    fetchTrainingSeminars(token).then((result) => { if (!cancelled) setPrograms(result.programs); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load summary.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  const periods = useMemo(() => trainingPeriodMetrics(programs, year), [programs, year]);
  const summary = useMemo(() => summarizeTrainings(periods.selected), [periods.selected]);
  const table = useTableControls(summary, (row, query) => row.name.toLowerCase().includes(query), 20);
  const conducted = summary.reduce((total, row) => total + row.conducted, 0);
  const scheduled = summary.reduce((total, row) => total + row.scheduled, 0);
  const repeated = summary.filter((row) => row.conducted > 1).length;
  const scope = year === 'undated' ? 'No start date' : year || 'All Years';
  const hours = periods.selected.filter((row) => row.status === 'Implemented').reduce((total, row) => total + (row.hours ?? 0), 0);
  const monthlyMax = Math.max(1, ...periods.monthly.map((row) => row.conducted));
  function changeYear(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('year', value); else next.delete('year');
    setSearchParams(next);
    table.setPage(1);
  }
  return <div>
    <PageHeader title="Training Programs Summary" description="Unique trainings, delivery counts, and monthly and annual activity." crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'Learning and Development', to: '/workspace/learning-development' }, { label: 'Summary' }]} />
    {loading ? <Card className="p-8"><p role="status" className="text-sm text-slate-500">Loading training summary…</p></Card> : error ? <Card className="space-y-3 p-8"><p role="alert" className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></Card> : <>
      <div className="mb-5 flex flex-wrap items-center gap-3"><label htmlFor="summary-year" className="text-sm font-medium text-slate-700">Year</label><Select id="summary-year" className="w-40" value={year} onChange={(event) => changeYear(event.target.value)}><option value="">All Years</option>{year && year !== 'undated' && !periods.years.includes(year) && <option value={year}>{year}</option>}{periods.years.map((value) => <option key={value} value={value}>{value}</option>)}<option value="undated">No start date</option></Select><p className="text-xs text-slate-500">Based on training start date. Metrics and frequency counts: {scope}.</p></div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[['Unique Trainings', summary.length], ['Times Conducted', conducted], ['Repeated Trainings', repeated], ['Scheduled Sessions', scheduled], ['Conducted Training Hours', hours], ['Total Records', periods.selected.length]].map(([label, value]) => <Card key={label} className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value.toLocaleString()}</p></Card>)}
      </div>
      <div className="mb-5 grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Conducted Trainings per Month · {scope}</CardTitle><p className="mt-1 text-xs text-slate-500">{year ? 'Implemented sessions by start month.' : 'Implemented sessions combined by calendar month across all years.'} Zero-activity months are included.</p></CardHeader><CardContent>
          <div className="space-y-2">{periods.monthly.map((row) => <div key={row.month} className="flex items-center gap-3 text-xs"><span className="w-7 text-slate-500">{row.month}</span><div className="h-4 flex-1 overflow-hidden rounded bg-slate-100" aria-hidden="true"><div className="h-full rounded bg-brand-600" style={{ width: `${row.conducted / monthlyMax * 100}%` }} /></div><span className="w-10 text-right font-semibold text-slate-800">{row.conducted.toLocaleString()}</span></div>)}</div>
          <p className="mt-4 text-xs text-slate-500">{periods.undatedConducted.toLocaleString()} conducted sessions without a start date are excluded from this chart. Hours total sums recorded session hours, not participant-hours.</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Trainings per Year</CardTitle><p className="mt-1 text-xs text-slate-500">All-year comparison by start date. Select a year to view its monthly activity and training frequency.</p></CardHeader><CardContent><div className="max-h-96 overflow-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface text-xs text-slate-500"><tr>{['Year', 'Unique', 'Conducted', 'Scheduled', 'Records'].map((label) => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{periods.annual.map((row) => <tr key={row.year} className={year === row.year ? 'bg-brand-50' : ''}><td className="px-3 py-2"><button type="button" onClick={() => changeYear(row.year)} className="font-semibold text-brand-700 underline underline-offset-2" aria-label={`Show ${row.year} summary`}>{row.year}</button></td><td className="px-3 py-2">{row.unique}</td><td className="px-3 py-2">{row.conducted}</td><td className="px-3 py-2">{row.scheduled}</td><td className="px-3 py-2">{row.records}</td></tr>)}{periods.annual.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">No dated training records.</td></tr>}</tbody></table></div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Training Frequency · {scope}</CardTitle><p className="mt-1 text-sm text-slate-500">{periods.selected.length.toLocaleString()} records in this selection. Names are grouped ignoring capitalization and extra spaces; batch numbers and other wording remain distinct. Each Implemented record counts as one conducted session. Repeated trainings have more than one conducted session.</p></CardHeader>
        <CardContent>
          <Toolbar search={table.search} onSearchChange={table.setSearch} placeholder="Search unique trainings…" onPrint={() => window.print()} />
          <p className="mb-3 text-xs text-slate-500">Qty Participants totals saved participants across the selected training records. Employees attending multiple sessions are counted once per session.</p>
          <p className="mb-3 text-xs text-slate-500">{table.filteredCount.toLocaleString()} matching unique trainings · Search filters this table; metrics follow the selected year.</p>
          <DataTable columns={columns} rows={table.pageRows} getRowId={(row) => row.id} cardTitle={(row) => row.name} sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} emptyTitle="No trainings found" emptyDescription="No training names match the current search." />
          <Pagination page={table.page} pageCount={table.pageCount} onChange={table.setPage} total={table.filteredCount} pageSize={20} />
        </CardContent>
      </Card>
    </>}
  </div>;
}
