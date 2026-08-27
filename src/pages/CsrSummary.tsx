import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useAuth } from '@/context/AuthContext';
import { fetchCsrRequests, type CsrRequest } from '@/lib/api';
import benecoLogo from '@/assets/brand/beneco-logo.png';
import { useSearchParams } from 'react-router-dom';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const currentYear = new Date().getFullYear();
const CHART_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e', '#14b8a6'];
const PAGE_SIZE = 20;
const COMMUNITY_RELATIONS_PROGRAM_TYPES = ['Partnership', 'Linkages', 'Networking'];

export default function CsrSummary() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const programTypeFilter = searchParams.get('programType')?.trim() ?? '';
  const isCommunityRelations = programTypeFilter === 'community-relations';
  const summaryTitle = isCommunityRelations ? 'Community Relations Summary' : 'Corporate Social Responsibility Summary';
  const requestName = isCommunityRelations ? 'Community Relations' : 'CSR';
  const [requests, setRequests] = useState<CsrRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof CsrRequest>('dateRequested');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchCsrRequests(token).then(setRequests).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load CSR requests.')).finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => requests.filter((request) => request.dateRequested >= startDate && request.dateRequested <= endDate && (!programTypeFilter || (isCommunityRelations ? COMMUNITY_RELATIONS_PROGRAM_TYPES.includes(request.programType) : request.programType === programTypeFilter))), [requests, startDate, endDate, isCommunityRelations, programTypeFilter]);
  const tableRows = useMemo(() => {
    const visible = filtered.filter((request) => Object.entries(columnFilters).every(([column, query]) => {
      if (!query) return true;
      const raw = request[column as keyof CsrRequest];
      const value = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
      return value.toLowerCase().includes(query.toLowerCase());
    }));
    return [...visible].sort((a, b) => {
      const left = a[sortKey] ?? '';
      const right = b[sortKey] ?? '';
      const comparison = ['amountFunding', 'actualProjectCost'].includes(sortKey)
        ? (Number(left) || 0) - (Number(right) || 0)
        : String(Array.isArray(left) ? left.join(', ') : left).localeCompare(String(Array.isArray(right) ? right.join(', ') : right), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [columnFilters, filtered, sortDir, sortKey]);
  const pageCount = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const pagedRows = tableRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [startDate, endDate, columnFilters]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function sortBy(key: string) {
    const nextKey = key as keyof CsrRequest;
    if (sortKey === nextKey) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortKey(nextKey); setSortDir('asc'); }
    setPage(1);
  }
  const countBy = (selector: (request: CsrRequest) => string) => filtered.reduce<Record<string, number>>((result, request) => { const key = selector(request) || 'Unspecified'; result[key] = (result[key] || 0) + 1; return result; }, {});
  const status = countBy((request) => request.status);
  const approval = countBy((request) => request.approvalStatus || 'For Evaluation');
  const policy = filtered.reduce<Record<string, number>>((result, request) => { const values = request.evaluationResult.length ? request.evaluationResult : ['Not Evaluated']; values.forEach((value) => { result[value] = (result[value] || 0) + 1; }); return result; }, {});
  const programs = countBy((request) => request.programType);
  const municipalities = countBy((request) => request.municipality);
  const months = countBy((request) => request.dateRequested.slice(0, 7));
  const districtMetrics = useMemo(() => Object.values(filtered.reduce<Record<string, { district: string; quantity: number; approved: number; forEvaluation: number; amount: number }>>((result, request) => {
    const district = request.district || 'Unspecified';
    const row = result[district] ?? { district, quantity: 0, approved: 0, forEvaluation: 0, amount: 0 };
    row.quantity += 1;
    if ((request.approvalStatus || '').toLowerCase() === 'approved') row.approved += 1;
    else row.forEvaluation += 1;
    row.amount += Number(request.amountFunding) || 0;
    result[district] = row;
    return result;
  }, {})).sort((a, b) => b.amount - a.amount || b.quantity - a.quantity || a.district.localeCompare(b.district)), [filtered]);
  const totalFunding = filtered.reduce((sum, request) => sum + (Number(request.amountFunding) || 0), 0);
  const totalActualProjectCost = filtered.reduce((sum, request) => sum + (Number(request.actualProjectCost) || 0), 0);
  const statusChartData = Object.entries(status).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const monthChartData = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, requests]) => ({ month, requests }));
  const requestColumns: Column<CsrRequest>[] = [
    { key: 'dateRequested', header: 'Date', sortable: true, filterable: true, render: (request) => request.dateRequested },
    { key: 'programType', header: 'Program Type', sortable: true, filterable: true, render: (request) => <span className="font-medium">{request.programType}</span> },
    { key: 'requestee', header: 'Requestee', sortable: true, filterable: true, render: (request) => request.requestee },
    { key: 'municipality', header: 'Municipality', sortable: true, filterable: true, render: (request) => request.municipality || '—' },
    { key: 'barangay', header: 'Barangay', sortable: true, filterable: true, render: (request) => request.barangay || '—' },
    { key: 'district', header: 'District', sortable: true, filterable: true, render: (request) => request.district || '—' },
    { key: 'pjrs', header: 'PJRS', sortable: true, filterable: true, render: (request) => request.pjrs || '—' },
    { key: 'status', header: 'Evaluation Status', sortable: true, filterable: true, render: (request) => request.status },
    { key: 'evaluationResult', header: 'Evaluation', sortable: true, filterable: true, render: (request) => request.evaluationResult.length ? request.evaluationResult.join(', ') : 'Not Evaluated' },
    { key: 'approvalStatus', header: 'Approval Status', sortable: true, filterable: true, render: (request) => request.approvalStatus || 'For Evaluation' },
    { key: 'amountFunding', header: 'Amount Funding', className: 'text-right', sortable: true, filterable: true, render: (request) => money.format(Number(request.amountFunding) || 0) },
    { key: 'actualProjectCost', header: 'Actual Project Cost', className: 'text-right', sortable: true, filterable: true, render: (request) => money.format(Number(request.actualProjectCost) || 0) },
  ];

  return <div>
    {!loading && !error && <section className="print-only csr-summary-print">
      <header className="csr-print-header"><img src={benecoLogo} alt="BENECO logo" /><div><p>Benguet Electric Cooperative</p><h1>{summaryTitle}</h1><span>Reporting period: {startDate} to {endDate}</span></div><aside><strong>Generated</strong><span>{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></aside></header>
      <div className="csr-print-metrics">
        <PrintMetric label="Total Requests" value={String(filtered.length)} />
        <PrintMetric label="Completed" value={String(status.Completed || 0)} />
        <PrintMetric label="Within CSR Policy" value={String(policy['Within CSR Policy'] || 0)} />
        <PrintMetric label="Total Funding" value={money.format(totalFunding)} />
        <PrintMetric label="Actual Project Cost" value={money.format(totalActualProjectCost)} />
      </div>
      <div className="csr-print-breakdowns">
        <PrintBreakdown title="Evaluation Status" values={status} />
        <PrintBreakdown title="Program Types" values={programs} />
        <div className="csr-print-panel"><h2>District Metrics</h2><table><thead><tr><th>District</th><th>Total</th><th>Approved</th><th>For Evaluation</th><th>Funding</th></tr></thead><tbody>{districtMetrics.map((row) => <tr key={row.district}><td>{row.district}</td><td>{row.quantity}</td><td>{row.approved}</td><td>{row.forEvaluation}</td><td>{money.format(row.amount)}</td></tr>)}</tbody></table></div>
      </div>
      <section className="csr-print-requests"><h2>CSR Request Summary</h2><table><thead><tr><th>No.</th><th>Date</th><th>Program Type</th><th>Requestee</th><th>Municipality</th><th>Barangay</th><th>District</th><th>Status</th><th>Evaluation</th><th>Funding</th><th>Actual Cost</th></tr></thead><tbody>{tableRows.map((request, index) => <tr key={request.id}><td>{index + 1}</td><td>{request.dateRequested}</td><td>{request.programType}</td><td>{request.requestee}</td><td>{request.municipality || '—'}</td><td>{request.barangay || '—'}</td><td>{request.district || '—'}</td><td>{request.status}</td><td>{request.evaluationResult.length ? request.evaluationResult.join(', ') : 'Not Evaluated'}</td><td>{money.format(Number(request.amountFunding) || 0)}</td><td>{money.format(Number(request.actualProjectCost) || 0)}</td></tr>)}</tbody></table></section>
      <footer className="csr-print-footer">BENECO Enterprise System · {summaryTitle}</footer>
    </section>}
    <div className="no-print">
    <div className="no-print"><PageHeader title={summaryTitle} description={`${requestName} activity, evaluation, funding, and geographic metrics.`} crumbs={[{ label: isCommunityRelations ? 'Community Relations' : 'Member-Consumer and Community Programs', to: isCommunityRelations ? '/workspace/preview/ISD/tools/Community%20Relations' : '/workspace/member-programs' }, { label: summaryTitle }]} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => window.close()}><X className="h-4 w-4" /> Close</Button></div>} /></div>
    <Card className="mb-5 no-print"><CardHeader><CardTitle>Reporting Period</CardTitle></CardHeader><CardContent><div className="max-w-xl"><DateRangePicker label="CSR Request Date Range" startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} /></div><p className="mt-2 text-sm text-slate-500">Metrics include requests dated {startDate} through {endDate}.</p></CardContent></Card>
    {loading ? <Card><CardContent className="py-12 text-center text-slate-500">Loading CSR metrics…</CardContent></Card> : error ? <Card><CardContent className="py-12 text-center text-red-600">{error}</CardContent></Card> : <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total Requests" value={String(filtered.length)} />
        <MetricCard label="Completed" value={String(status.Completed || 0)} />
        <MetricCard label="Within CSR Policy" value={String(policy['Within CSR Policy'] || 0)} />
        <MetricCard label="Total Funding" value={money.format(totalFunding)} />
        <MetricCard label="Actual Project Cost" value={money.format(totalActualProjectCost)} />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <StatusPieChart data={statusChartData} className="xl:col-span-2" />
        <Breakdown title="Approval Status" values={approval} total={filtered.length} className="xl:col-span-2" />
        <Breakdown title="Policy Evaluation" values={policy} total={filtered.length} className="xl:col-span-2" />
        <Breakdown title="Program Types" values={programs} total={filtered.length} className="xl:col-span-3" />
        <MonthlyBarChart data={monthChartData} className="xl:col-span-3" />
        <Card className="xl:col-span-4 xl:row-span-2"><CardHeader><CardTitle>District Metrics</CardTitle><p className="text-sm text-slate-500">Total requests, approval breakdown, and approved/requested funding by district.</p></CardHeader><CardContent>{districtMetrics.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">District</th><th className="py-2 text-right">Total</th><th className="py-2 text-right">Approved</th><th className="py-2 text-right">For Evaluation</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{districtMetrics.map((row) => <tr key={row.district} className="border-b last:border-0"><td className="py-3 font-medium">{row.district}</td><td className="py-3 text-right">{row.quantity}</td><td className="py-3 text-right text-emerald-600">{row.approved}</td><td className="py-3 text-right">{row.forEvaluation}</td><td className="py-3 text-right font-semibold">{money.format(row.amount)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 font-bold"><td className="py-3">Total</td><td className="py-3 text-right">{filtered.length}</td><td className="py-3 text-right">{districtMetrics.reduce((sum, row) => sum + row.approved, 0)}</td><td className="py-3 text-right">{districtMetrics.reduce((sum, row) => sum + row.forEvaluation, 0)}</td><td className="py-3 text-right">{money.format(totalFunding)}</td></tr></tfoot></table></div> : <p className="py-8 text-center text-sm text-slate-500">No district data for this period.</p>}</CardContent></Card>
        <Breakdown title="Municipalities" values={municipalities} total={filtered.length} className="xl:col-span-2 xl:row-span-2" />
      </div>
      <Card className="mt-5"><CardHeader><CardTitle>CSR Request Summary</CardTitle></CardHeader><CardContent><DataTable columns={requestColumns} rows={pagedRows} getRowId={(request) => request.id} cardTitle={(request) => request.programType} sortKey={sortKey} sortDir={sortDir} onSort={sortBy} columnFilters={columnFilters} onColumnFilterChange={(key, value) => setColumnFilters((current) => ({ ...current, [key]: value }))} minWidthPx={1750} emptyTitle="No CSR requests" emptyDescription="No CSR requests fall within the selected reporting period." />{tableRows.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tableRows.length)} of {tableRows.length}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="min-w-24 text-center text-sm text-slate-600">Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next <ChevronRight className="h-4 w-4" /></Button></div></div>}</CardContent></Card>
    </>}
    </div>
  </div>;
}

function MetricCard({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></CardContent></Card>; }

function PrintMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function PrintBreakdown({ title, values }: { title: string; values: Record<string, number> }) { return <div className="csr-print-panel"><h2>{title}</h2><table><tbody>{Object.entries(values).sort((a, b) => b[1] - a[1]).map(([label, count]) => <tr key={label}><td>{label}</td><td>{count}</td></tr>)}</tbody></table></div>; }

function Breakdown({ title, values, total, className }: { title: string; values: Record<string, number>; total: number; className?: string }) { const rows = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); return <Card className={className}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="space-y-3">{rows.map(([label, count]) => <div key={label}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><strong>{count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? Math.max(3, (count / total) * 100) : 0}%` }} /></div></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }

function StatusPieChart({ data, className }: { data: { name: string; value: number }[]; className?: string }) { return <Card className={className}><CardHeader><CardTitle>Evaluation Status</CardTitle></CardHeader><CardContent>{data.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={48} outerRadius={82} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>{data.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 8 }} /></PieChart></ResponsiveContainer></div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }

function MonthlyBarChart({ data, className }: { data: { month: string; requests: number }[]; className?: string }) { return <Card className={className}><CardHeader><CardTitle>Requests by Month</CardTitle></CardHeader><CardContent>{data.length ? <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} contentStyle={{ borderRadius: 8 }} /><Bar dataKey="requests" name="Requests" fill="#10b981" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }
