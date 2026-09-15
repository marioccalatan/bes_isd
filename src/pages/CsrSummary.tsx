import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Printer, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Checkbox } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { fetchCsrBudgetAllocations, fetchCsrRequests, type CsrBudgetAllocation, type CsrRequest } from '@/lib/api';
import benecoLogo from '@/assets/brand/beneco-logo.png';
import { useSearchParams } from 'react-router-dom';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const currentYear = new Date().getFullYear();
const CHART_COLORS = ['#10b981', '#38bdf8', '#f59e0b', '#a78bfa', '#f43f5e', '#14b8a6'];
const PAGE_SIZE = 20;
const COMMUNITY_RELATIONS_PROGRAM_TYPES = ['Partnership', 'Linkages', 'Networking'];
const INSTITUTIONAL_DISTRICT = 'INSTITUTIONAL';

function isWithinRange(date: string, startDate: string, endDate: string) {
  return Boolean(date) && date >= startDate && date <= endDate;
}

function summaryApprovalStatus(request: CsrRequest) {
  if (!request.evaluationResult.length) return 'For Evaluation';
  if (request.approvalStatus === 'Approved' || request.approvalStatus === 'Disapproved' || request.approvalStatus === 'For Approval') return request.approvalStatus;
  if (request.evaluationResult.includes('Not Within CSR Policy')) return 'Disapproved';
  if (request.evaluationResult.includes('Within CSR Policy')) return 'Approved';
  return request.approvalStatus || 'For Evaluation';
}

export default function CsrSummary() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const programTypeFilter = searchParams.get('programType')?.trim() ?? '';
  const isCommunityRelations = programTypeFilter === 'community-relations';
  const summaryTitle = isCommunityRelations ? 'Community Relations Summary' : 'Corporate Social Responsibility Summary';
  const requestName = isCommunityRelations ? 'Community Relations' : 'CSR';
  const [requests, setRequests] = useState<CsrRequest[]>([]);
  const [budgetAllocations, setBudgetAllocations] = useState<CsrBudgetAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof CsrRequest>('dateRequested');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [hoveredRequest, setHoveredRequest] = useState<CsrRequest | null>(null);
  const [monthChartOrientation, setMonthChartOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [includeDateReleased, setIncludeDateReleased] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([fetchCsrRequests(token), fetchCsrBudgetAllocations(token)])
      .then(([csrRequests, allocations]) => { setRequests(csrRequests); setBudgetAllocations(allocations); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load CSR summary data.'))
      .finally(() => setLoading(false));
  }, [token]);

  const matchesProgramType = (request: CsrRequest) => !programTypeFilter || (isCommunityRelations ? COMMUNITY_RELATIONS_PROGRAM_TYPES.includes(request.programType) : request.programType === programTypeFilter);
  const isIncludedByReleaseDate = (request: CsrRequest) => !isWithinRange(request.dateRequested, startDate, endDate) && isWithinRange(request.dateReleased, startDate, endDate);
  const filtered = useMemo(() => requests.filter((request) => {
    if (!matchesProgramType(request)) return false;
    if (isWithinRange(request.dateRequested, startDate, endDate)) return true;
    return includeDateReleased && isIncludedByReleaseDate(request);
  }), [requests, startDate, endDate, includeDateReleased, isCommunityRelations, programTypeFilter]);
  const releaseDateIncludedCount = useMemo(() => includeDateReleased ? filtered.filter(isIncludedByReleaseDate).length : 0, [filtered, includeDateReleased, startDate, endDate]);
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

  useEffect(() => { setPage(1); }, [startDate, endDate, includeDateReleased, columnFilters]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  function sortBy(key: string) {
    const nextKey = key as keyof CsrRequest;
    if (sortKey === nextKey) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setSortKey(nextKey); setSortDir('asc'); }
    setPage(1);
  }
  const countBy = (selector: (request: CsrRequest) => string) => filtered.reduce<Record<string, number>>((result, request) => { const key = selector(request) || 'Unspecified'; result[key] = (result[key] || 0) + 1; return result; }, {});
  const status = countBy((request) => request.status);
  const approval = { 'For Approval': 0, ...countBy(summaryApprovalStatus) };
  const policy = filtered.reduce<Record<string, number>>((result, request) => { const values = request.evaluationResult.length ? request.evaluationResult : ['Not Evaluated']; values.forEach((value) => { result[value] = (result[value] || 0) + 1; }); return result; }, {});
  const programs = countBy((request) => request.programType);
  const municipalityRows = useMemo(() => Object.values(filtered.reduce<Record<string, { label: string; total: number; approved: number }>>((result, request) => {
    const label = request.municipality || 'Unspecified';
    const row = result[label] ?? { label, total: 0, approved: 0 };
    row.total += 1;
    if (summaryApprovalStatus(request) === 'Approved') row.approved += 1;
    result[label] = row;
    return result;
  }, {})).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)), [filtered]);
  const months = countBy((request) => (isIncludedByReleaseDate(request) ? request.dateReleased : request.dateRequested).slice(0, 7));
  const budgetYears = useMemo(() => {
    const startYear = Number(startDate.slice(0, 4)) || currentYear;
    const endYear = Number(endDate.slice(0, 4)) || startYear;
    const first = Math.min(startYear, endYear);
    const last = Math.max(startYear, endYear);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [endDate, startDate]);
  const budgetByDistrict = useMemo(() => budgetAllocations.reduce<Record<string, number>>((result, allocation) => {
    if (!budgetYears.includes(allocation.year)) return result;
    const district = allocation.district.trim() || 'Unspecified';
    result[district] = (result[district] || 0) + (Number(allocation.budget) || 0);
    return result;
  }, {}), [budgetAllocations, budgetYears]);
  const budgetByProgramType = useMemo(() => budgetAllocations.reduce<Record<string, number>>((result, allocation) => {
    if (!budgetYears.includes(allocation.year) || allocation.district.trim().toUpperCase() === INSTITUTIONAL_DISTRICT) return result;
    const programType = allocation.programType || 'Unspecified';
    result[programType] = (result[programType] || 0) + (Number(allocation.budget) || 0);
    return result;
  }, {}), [budgetAllocations, budgetYears]);
  const actualProjectCostByProgramType = useMemo(() => filtered.reduce<Record<string, number>>((result, request) => {
    const programType = request.programType || 'Unspecified';
    result[programType] = (result[programType] || 0) + (Number(request.actualProjectCost) || 0);
    return result;
  }, {}), [filtered]);
  const institutionalBudget = useMemo(() => budgetAllocations.reduce((sum, allocation) => budgetYears.includes(allocation.year) && allocation.district.trim().toUpperCase() === INSTITUTIONAL_DISTRICT ? sum + (Number(allocation.budget) || 0) : sum, 0), [budgetAllocations, budgetYears]);
  const institutionalActualProjectCost = useMemo(() => filtered.filter((request) => request.institutional).reduce((sum, request) => sum + (Number(request.actualProjectCost) || 0), 0), [filtered]);
  const programTypeRows = useMemo(() => {
    const rows = Object.entries(programs).map(([programType, count]) => ({ programType, count, budget: budgetByProgramType[programType] || 0, projectCost: actualProjectCostByProgramType[programType] || 0 }));
    const institutionalCount = filtered.filter((request) => request.institutional).length;
    if (institutionalBudget > 0 || institutionalCount > 0) rows.push({ programType: 'Institutional', count: institutionalCount, budget: institutionalBudget, projectCost: institutionalActualProjectCost });
    return rows.sort((a, b) => b.count - a.count || a.programType.localeCompare(b.programType));
  }, [actualProjectCostByProgramType, budgetByProgramType, filtered, institutionalActualProjectCost, institutionalBudget, programs]);
  const districtMetrics = useMemo(() => Object.values(filtered.reduce<Record<string, { district: string; quantity: number; approved: number; forEvaluation: number; amount: number; budget: number }>>((result, request) => {
    const district = request.institutional ? INSTITUTIONAL_DISTRICT : request.district || 'Unspecified';
    const row = result[district] ?? { district, quantity: 0, approved: 0, forEvaluation: 0, amount: 0, budget: budgetByDistrict[district] || 0 };
    row.quantity += 1;
    row.budget = budgetByDistrict[district] || 0;
    if (summaryApprovalStatus(request) === 'Approved') row.approved += 1;
    else row.forEvaluation += 1;
    if (summaryApprovalStatus(request) === 'Approved') row.amount += Number(request.amountFunding) || 0;
    result[district] = row;
    return result;
  }, Object.entries(budgetByDistrict).reduce<Record<string, { district: string; quantity: number; approved: number; forEvaluation: number; amount: number; budget: number }>>((result, [district, budget]) => {
    result[district] = { district, quantity: 0, approved: 0, forEvaluation: 0, amount: 0, budget };
    return result;
  }, {}))).sort((a, b) => b.amount - a.amount || b.quantity - a.quantity || a.district.localeCompare(b.district)), [budgetByDistrict, filtered]);
  const approvedRequests = filtered.filter((request) => summaryApprovalStatus(request) === 'Approved');
  const totalFunding = approvedRequests.reduce((sum, request) => sum + (Number(request.amountFunding) || 0), 0);
  const totalActualProjectCost = approvedRequests.reduce((sum, request) => sum + (Number(request.actualProjectCost) || 0), 0);
  const institutionalCount = filtered.filter((request) => request.institutional).length;
  const nonInstitutionalRequests = filtered.filter((request) => !request.institutional);
  const nonInstitutionalStatus = nonInstitutionalRequests.reduce<Record<string, number>>((result, request) => { const key = request.status || 'Unspecified'; result[key] = (result[key] || 0) + 1; return result; }, {});
  const nonInstitutionalPolicy = nonInstitutionalRequests.reduce<Record<string, number>>((result, request) => { const values = request.evaluationResult.length ? request.evaluationResult : ['Not Evaluated']; values.forEach((value) => { result[value] = (result[value] || 0) + 1; }); return result; }, {});
  const institutionalByProgramType = Object.values(filtered.filter((request) => request.institutional).reduce<Record<string, { programType: string; amount: number }>>((result, request) => {
    const programType = request.programType || 'Unspecified';
    const row = result[programType] ?? { programType, amount: 0 };
    row.amount += Number(request.amountFunding) || 0;
    result[programType] = row;
    return result;
  }, {})).sort((a, b) => b.amount - a.amount || a.programType.localeCompare(b.programType));
  const completedCount = nonInstitutionalStatus.Completed || 0;
  const pendingCount = nonInstitutionalStatus.Pending || 0;
  const forEvaluationCount = nonInstitutionalStatus['For evaluation'] || 0;
  const withinPolicyCount = nonInstitutionalPolicy['Within CSR Policy'] || 0;
  const implementedCount = nonInstitutionalRequests.filter((request) => request.closedApproved).length;
  const statusChartImplementedCount = filtered.filter((request) => request.closedApproved).length;
  const statusChartData = Object.entries(status).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, note: name === 'Completed' && statusChartImplementedCount ? `Implemented: ${statusChartImplementedCount}/${value}` : undefined }));
  const monthChartData = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, requests]) => ({ month, requests }));
  const requestColumns: Column<CsrRequest>[] = [
    { key: 'dateRequested', header: 'Date', sortable: true, filterable: true, render: (request) => request.dateRequested },
    { key: 'institutional', header: 'Institutional', className: 'text-center', sortable: true, filterable: true, filterOptions: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }], render: (request) => request.institutional ? <Check className="mx-auto h-5 w-5 text-emerald-500" aria-label="Institutional" /> : '—' },
    { key: 'withLetterReply', header: 'Letter Reply', className: 'text-center', sortable: true, filterable: true, filterOptions: [{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }], render: (request) => request.withLetterReply ? <Check className="mx-auto h-5 w-5 text-emerald-500" aria-label="With letter reply" /> : '—' },
    { key: 'programType', header: 'Program Type', sortable: true, filterable: true, render: (request) => <span className="font-medium">{request.programType}</span> },
    { key: 'requestee', header: 'Requestee', sortable: true, filterable: true, render: (request) => request.requestee },
    { key: 'municipality', header: 'Municipality', sortable: true, filterable: true, render: (request) => request.municipality || '—' },
    { key: 'barangay', header: 'Barangay', sortable: true, filterable: true, render: (request) => request.barangay || '—' },
    { key: 'district', header: 'District', sortable: true, filterable: true, render: (request) => request.district || '—' },
    { key: 'pjrs', header: 'PJRS', sortable: true, filterable: true, render: (request) => request.pjrs || '—' },
    { key: 'status', header: 'Evaluation Status', sortable: true, filterable: true, render: (request) => request.status },
    { key: 'evaluationResult', header: 'Evaluation', sortable: true, filterable: true, render: (request) => request.evaluationResult.length ? request.evaluationResult.join(', ') : 'Not Evaluated' },
    { key: 'approvalStatus', header: 'Approval Status', sortable: true, filterable: true, render: (request) => summaryApprovalStatus(request) },
    { key: 'dateReleased', header: 'Date Released', sortable: true, filterable: true, render: (request) => request.dateReleased || '—' },
    { key: 'amountFunding', header: 'Amount Funding', className: 'text-right', sortable: true, filterable: true, render: (request) => money.format(Number(request.amountFunding) || 0) },
    { key: 'actualProjectCost', header: 'Actual Project Cost', className: 'text-right', sortable: true, filterable: true, render: (request) => money.format(Number(request.actualProjectCost) || 0) },
  ];

  return <div>
    {!loading && !error && <section className="print-only csr-summary-print">
      <header className="csr-print-header"><img src={benecoLogo} alt="BENECO logo" /><div><p>Benguet Electric Cooperative</p><h1>{summaryTitle}</h1><span>Reporting period: {startDate} to {endDate}</span></div><aside><strong>Generated</strong><span>{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></aside></header>
      <div className="csr-print-metrics">
        <PrintMetric label="Total Requests" value={String(filtered.length)} />
        <PrintMetric label="Completed" value={String(completedCount)} />
        <PrintMetric label="Pending" value={String(pendingCount)} />
        <PrintMetric label="For evaluation" value={String(forEvaluationCount)} />
        <PrintMetric label="Within CSR Policy" value={`${withinPolicyCount} / ${completedCount}`} />
        <PrintMetric label="Implemented" value={`${implementedCount} / ${withinPolicyCount}`} />
        <PrintMetric label="Institutional" value={String(institutionalCount)} />
        <PrintMetric label="Total Funding" value={money.format(totalFunding)} />
        <PrintMetric label="Actual Project Cost" value={money.format(totalActualProjectCost)} />
      </div>
      <div className="csr-print-dashboard">
        <PrintBreakdown title="Evaluation Status" values={status} note={statusChartData.find((entry) => entry.name === 'Completed')?.note} />
        <PrintBreakdown title="Policy Evaluation" values={policy} />
        <PrintBreakdown title="Approval Status" values={approval} />
        <PrintProgramTypePanel rows={programTypeRows} />
        <PrintMonthPanel rows={monthChartData} />
        <PrintMunicipalityPanel rows={municipalityRows} />
        <div className="csr-print-panel csr-print-wide"><h2>District Metrics</h2><table><thead><tr><th>District</th><th>Total</th><th>Approved</th><th>For Evaluation</th><th>Amount</th><th>Budget</th></tr></thead><tbody>{districtMetrics.map((row) => <tr key={row.district}><td>{row.district}</td><td>{row.quantity}</td><td>{row.approved}</td><td>{row.forEvaluation}</td><td>{money.format(row.amount)}</td><td>{money.format(row.budget)}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td>{filtered.length}</td><td>{districtMetrics.reduce((sum, row) => sum + row.approved, 0)}</td><td>{districtMetrics.reduce((sum, row) => sum + row.forEvaluation, 0)}</td><td>{money.format(totalFunding)}</td><td>{money.format(districtMetrics.reduce((sum, row) => sum + row.budget, 0))}</td></tr></tfoot></table></div>
        <div className="csr-print-panel"><h2>Institutional</h2>{institutionalByProgramType.length ? <table><tbody>{institutionalByProgramType.map((row) => <tr key={row.programType}><td>{row.programType}</td><td>{money.format(row.amount)}</td></tr>)}</tbody></table> : <p className="csr-print-empty">No institutional requests for this period.</p>}</div>
      </div>
      <footer className="csr-print-footer">BENECO Enterprise System · {summaryTitle}</footer>
    </section>}
    <div className="no-print">
    <div className="no-print"><PageHeader title={summaryTitle} description={`${requestName} activity, evaluation, funding, and geographic metrics.`} crumbs={[{ label: isCommunityRelations ? 'Community Relations' : 'Member-Consumer and Community Programs', to: isCommunityRelations ? '/workspace/preview/ISD/tools/Community%20Relations' : '/workspace/member-programs' }, { label: summaryTitle }]} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => window.close()}><X className="h-4 w-4" /> Close</Button></div>} /></div>
    <Card className="mb-5 no-print"><CardHeader><CardTitle>Reporting Period</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-end gap-4"><div className="min-w-[280px] flex-1 max-w-xl"><DateRangePicker label="CSR Request Date Range" startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} /></div><label className="mb-2 flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><Checkbox checked={includeDateReleased} onChange={(event) => setIncludeDateReleased(event.target.checked)} />Include based on Date Released</label></div><p className="mt-2 text-sm text-slate-500">Metrics include requests dated {startDate} through {endDate}{includeDateReleased ? ', plus requests released within the range.' : '.'}</p></CardContent></Card>
    {loading ? <Card><CardContent className="py-12 text-center text-slate-500">Loading CSR metrics…</CardContent></Card> : error ? <Card><CardContent className="py-12 text-center text-red-600">{error}</CardContent></Card> : <>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <MetricCard label="Total Requests" value={String(filtered.length)} note={releaseDateIncludedCount ? `(${releaseDateIncludedCount} ${releaseDateIncludedCount === 1 ? 'request' : 'requests'} included based on date release of budget)` : undefined} />
        <MetricCard label="Completed" value={String(completedCount)} />
        <MetricCard label="Pending" value={String(pendingCount)} />
        <MetricCard label="For evaluation" value={String(forEvaluationCount)} />
        <MetricCard label="Within CSR Policy" value={`${withinPolicyCount} / ${completedCount}`} />
        <MetricCard label="Implemented" value={`${implementedCount} / ${withinPolicyCount}`} />
        <MetricCard label="Institutional" value={String(institutionalCount)} />
        <MetricCard label="Total Funding" value={money.format(totalFunding)} />
        <MetricCard label="Actual Project Cost" value={money.format(totalActualProjectCost)} />
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        <StatusPieChart data={statusChartData} className="xl:col-span-2" />
        <Breakdown title="Policy Evaluation" values={policy} total={filtered.length} className="xl:col-span-2" />
        <Breakdown title="Approval Status" values={approval} total={filtered.length} className="xl:col-span-2" />
        <ProgramTypeBudgetCard rows={programTypeRows} total={filtered.length} className="xl:col-span-3" />
        <MonthlyBarChart data={monthChartData} orientation={monthChartOrientation} onToggleOrientation={() => setMonthChartOrientation((current) => current === 'horizontal' ? 'vertical' : 'horizontal')} className="xl:col-span-3" />
        <Card className="xl:col-span-4 xl:row-span-2"><CardHeader><CardTitle>District Metrics</CardTitle><p className="text-sm text-slate-500">Total requests, approval breakdown, approved funding, and selected-year budget by district.</p></CardHeader><CardContent>{districtMetrics.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">District</th><th className="py-2 text-right">Total</th><th className="py-2 text-right">Approved</th><th className="py-2 text-right">For Evaluation</th><th className="py-2 text-right">Amount</th><th className="py-2 text-right">Budget</th></tr></thead><tbody>{districtMetrics.map((row) => <tr key={row.district} className="border-b last:border-0"><td className="py-3 font-medium">{row.district}</td><td className="py-3 text-right">{row.quantity}</td><td className="py-3 text-right text-emerald-600">{row.approved}</td><td className="py-3 text-right">{row.forEvaluation}</td><td className="py-3 text-right font-semibold">{money.format(row.amount)}</td><td className="py-3 text-right font-semibold text-blue-600">{money.format(row.budget)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 font-bold"><td className="py-3">Total</td><td className="py-3 text-right">{filtered.length}</td><td className="py-3 text-right">{districtMetrics.reduce((sum, row) => sum + row.approved, 0)}</td><td className="py-3 text-right">{districtMetrics.reduce((sum, row) => sum + row.forEvaluation, 0)}</td><td className="py-3 text-right">{money.format(totalFunding)}</td><td className="py-3 text-right text-blue-600">{money.format(districtMetrics.reduce((sum, row) => sum + row.budget, 0))}</td></tr></tfoot></table></div> : <p className="py-8 text-center text-sm text-slate-500">No district data for this period.</p>}</CardContent></Card>
        <MunicipalityApprovalBreakdown rows={municipalityRows} className="xl:col-span-2 xl:row-span-2" />
        <InstitutionalAmountCard rows={institutionalByProgramType} className="xl:col-span-2" />
      </div>
        <Card className="mt-5"><CardHeader><CardTitle>CSR Request Summary</CardTitle></CardHeader><CardContent><DataTable columns={requestColumns} rows={pagedRows} getRowId={(request) => request.id} cardTitle={(request) => request.programType} sortKey={sortKey} sortDir={sortDir} onSort={sortBy} columnFilters={columnFilters} onColumnFilterChange={(key, value) => setColumnFilters((current) => ({ ...current, [key]: value }))} onRowMouseEnter={setHoveredRequest} onRowMouseLeave={() => setHoveredRequest(null)} minWidthPx={1950} emptyTitle="No CSR requests" emptyDescription="No CSR requests fall within the selected reporting period." />{tableRows.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tableRows.length)} of {tableRows.length}</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" /> Previous</Button><span className="min-w-24 text-center text-sm text-slate-600">Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next <ChevronRight className="h-4 w-4" /></Button></div></div>}</CardContent></Card>
    </>}
    {hoveredRequest && <CsrRequestHoverSummary request={hoveredRequest} />}
    </div>
  </div>;
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) { return <Card><CardContent className="p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1.5 break-words text-xl font-bold text-slate-900">{value}</p>{note && <p className="mt-1 text-xs font-medium leading-snug text-blue-600">{note}</p>}</CardContent></Card>; }

function PrintMetric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function PrintBreakdown({ title, values, note }: { title: string; values: Record<string, number>; note?: string }) {
  const rows = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = rows.reduce((sum, [, count]) => sum + count, 0);
  return <div className="csr-print-panel"><h2>{title}</h2>{note && <p className="csr-print-note">{note}</p>}<div className="csr-print-bars">{rows.map(([label, count], index) => <PrintBar key={label} label={label} value={String(count)} amount={count} total={total} color={CHART_COLORS[index % CHART_COLORS.length]} />)}</div></div>;
}

function PrintBar({ label, value, amount, total, color }: { label: string; value: string; amount: number; total: number; color: string }) {
  return <div className="csr-print-bar"><div><span><i style={{ backgroundColor: color }} />{label}</span><strong>{value}</strong></div><b><em style={{ width: `${total && amount > 0 ? Math.max(3, (amount / total) * 100) : 0}%`, backgroundColor: color }} /></b></div>;
}

function PrintProgramTypePanel({ rows }: { rows: Array<{ programType: string; count: number; budget: number; projectCost: number }> }) {
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0);
  const totalProjectCost = rows.reduce((sum, row) => sum + row.projectCost, 0);
  return <div className="csr-print-panel csr-print-wide"><h2>Program Types</h2><div className="csr-print-bars">{rows.map((row) => { const utilization = row.budget ? (row.projectCost / row.budget) * 100 : 0; return <div key={row.programType} className="csr-print-program-row"><div><span>{row.programType}</span><strong>{money.format(row.projectCost)}</strong></div><div><small>Budget {money.format(row.budget)} · {utilization.toFixed(2)}% utilized</small><b>{row.count}</b></div><div className="csr-print-track"><em style={{ width: `${totalCount ? Math.max(3, (row.count / totalCount) * 100) : 0}%` }} /></div></div>; })}<div className="csr-print-total-row"><span>Total Project Cost</span><strong>{money.format(totalProjectCost)}</strong><small>Budget {money.format(totalBudget)} · {totalBudget ? ((totalProjectCost / totalBudget) * 100).toFixed(2) : '0.00'}% utilized</small></div></div></div>;
}

function PrintMonthPanel({ rows }: { rows: { month: string; requests: number }[] }) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.requests), 0);
  return <div className="csr-print-panel"><h2>Requests by Month</h2><div className="csr-print-bars">{rows.map((row) => <PrintBar key={row.month} label={row.month} value={String(row.requests)} amount={row.requests} total={max} color="#10b981" />)}</div></div>;
}

function PrintMunicipalityPanel({ rows }: { rows: Array<{ label: string; total: number; approved: number }> }) {
  const max = rows.reduce((largest, row) => Math.max(largest, row.total), 0);
  return <div className="csr-print-panel"><h2>Municipalities</h2><div className="csr-print-bars">{rows.map((row) => { const totalWidth = max ? Math.max(3, (row.total / max) * 100) : 0; const approvedWidth = row.total ? (row.approved / row.total) * 100 : 0; const remainingWidth = row.total ? ((row.total - row.approved) / row.total) * 100 : 0; return <div key={row.label} className="csr-print-bar"><div><span>{row.label}</span><strong>{row.approved} / {row.total}</strong></div><b><em className="csr-print-stacked" style={{ width: `${totalWidth}%` }}><i style={{ width: `${approvedWidth}%` }} /><u style={{ width: `${remainingWidth}%` }} /></em></b></div>; })}</div></div>;
}

function Breakdown({ title, values, total, className }: { title: string; values: Record<string, number>; total: number; className?: string }) { const rows = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); const chartData = rows.map(([name, value]) => ({ name, value })); return <Card className={className}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="space-y-4"><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={34} outerRadius={58} paddingAngle={2} label={(props) => { const payload = props.payload as { name: string; value: number }; return payload.value > 0 ? `${payload.name}: ${payload.value}` : ''; }}>{chartData.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 8 }} /></PieChart></ResponsiveContainer></div>{rows.map(([label, count], index) => { const color = CHART_COLORS[index % CHART_COLORS.length]; return <div key={label}><div className="mb-1 flex justify-between gap-3 text-sm font-medium"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{label}</span><strong>{count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${total && count > 0 ? Math.max(3, (count / total) * 100) : 0}%`, backgroundColor: color }} /></div></div>; })}</div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }

function MunicipalityApprovalBreakdown({ rows, className }: { rows: Array<{ label: string; total: number; approved: number }>; className?: string }) {
  const maxTotal = rows.reduce((max, row) => Math.max(max, row.total), 0);
  return <Card className={`${className ?? ''} flex min-h-[360px] flex-col`}><CardHeader><CardTitle>Municipalities</CardTitle><p className="text-sm text-slate-500">Bar length shows request volume; colors show approved and remaining.</p></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col">{rows.length ? <><div className="flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-y-auto pr-1">{rows.map((row) => { const pending = Math.max(0, row.total - row.approved); const totalWidth = maxTotal ? Math.max(3, (row.total / maxTotal) * 100) : 0; const approvedWidth = row.total ? (row.approved / row.total) * 100 : 0; const pendingWidth = row.total ? (pending / row.total) * 100 : 0; return <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{row.label}</span><strong>{row.approved} / {row.total}</strong></div><div className="h-1.5 rounded-full bg-slate-100"><div className="flex h-full overflow-hidden rounded-full" style={{ width: `${totalWidth}%` }}><div className="h-full bg-emerald-500" style={{ width: `${approvedWidth}%` }} /><div className="h-full bg-sky-400" style={{ width: `${pendingWidth}%` }} /></div></div></div>; })}</div><div className="flex flex-wrap gap-3 pt-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Approved</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Remaining</span></div></> : <p className="flex flex-1 items-center justify-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>;
}

function ProgramTypeBudgetCard({ rows, total, className }: { rows: Array<{ programType: string; count: number; budget: number; projectCost: number }>; total: number; className?: string }) {
  const totalBudget = rows.reduce((sum, row) => sum + row.budget, 0);
  const totalProjectCost = rows.reduce((sum, row) => sum + row.projectCost, 0);
  const totalUtilization = totalBudget ? (totalProjectCost / totalBudget) * 100 : 0;
  return <Card className={className}><CardHeader><CardTitle>Program Types</CardTitle></CardHeader><CardContent>{rows.length ? <div className="space-y-3">{rows.map((row) => { const utilization = row.budget ? (row.projectCost / row.budget) * 100 : 0; return <div key={row.programType}><div className="mb-1 grid grid-cols-[1fr_auto_2rem] items-start gap-3 text-sm"><span>{row.programType}</span><span className="text-right"><strong className="block text-slate-900">{money.format(row.projectCost)}</strong><span className="mt-0.5 block text-xs font-semibold text-blue-600">Budget {money.format(row.budget)}</span><span className="mt-0.5 block text-xs font-semibold text-emerald-600">{utilization.toFixed(2)}% utilized</span></span><strong className="text-right">{row.count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? Math.max(3, (row.count / total) * 100) : 0}%` }} /></div></div>; })}<div className="flex items-start justify-between gap-4 border-t border-slate-200 pt-3 text-sm font-bold text-slate-900"><span>Total Project Cost</span><span className="text-right"><strong className="block">{money.format(totalProjectCost)}</strong><span className="mt-0.5 block text-xs text-blue-600">Budget {money.format(totalBudget)}</span><span className="mt-0.5 block text-xs text-emerald-600">{totalUtilization.toFixed(2)}% utilized</span></span></div></div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>;
}

function InstitutionalAmountCard({ rows, className }: { rows: Array<{ programType: string; amount: number }>; className?: string }) {
  return <Card className={className}><CardHeader><CardTitle>Institutional</CardTitle><p className="text-sm text-slate-500">Program type funding for institutional requests.</p></CardHeader><CardContent>{rows.length ? <div className="space-y-3">{rows.map((row) => <div key={row.programType} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 last:pb-0"><span className="text-sm text-slate-700">{row.programType}</span><strong className="whitespace-nowrap text-sm text-slate-900">{money.format(row.amount)}</strong></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No institutional requests for this period.</p>}</CardContent></Card>;
}

function StatusPieChart({ data, className }: { data: { name: string; value: number; note?: string }[]; className?: string }) { const completedNote = data.find((entry) => entry.name === 'Completed')?.note; const total = data.reduce((sum, entry) => sum + entry.value, 0); return <Card className={className}><CardHeader><CardTitle>Evaluation Status</CardTitle>{completedNote && <p className="text-sm font-medium text-emerald-600">{completedNote}</p>}</CardHeader><CardContent>{data.length ? <div className="space-y-4"><div className="h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={34} outerRadius={58} paddingAngle={2} label={(props) => { const payload = props.payload as { name: string; value: number }; return `${payload.name}: ${payload.value}`; }}>{data.map((entry, index) => <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie><Tooltip formatter={(value, _name, item) => [item.payload.note ? `${value} (${item.payload.note})` : value, item.payload.name]} contentStyle={{ borderRadius: 8 }} /></PieChart></ResponsiveContainer></div>{data.map((entry, index) => <div key={entry.name}><div className="mb-1 flex justify-between gap-3 text-sm font-medium"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />{entry.name}</span><strong>{entry.value}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${total ? Math.max(3, (entry.value / total) * 100) : 0}%`, backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} /></div></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }

function MonthlyBarChart({ data, orientation, onToggleOrientation, className }: { data: { month: string; requests: number }[]; orientation: 'horizontal' | 'vertical'; onToggleOrientation: () => void; className?: string }) {
  const horizontal = orientation === 'horizontal';
  return <Card className={`${className ?? ''} flex min-h-[420px] flex-col`}><CardHeader className="flex flex-row items-center justify-between gap-3"><CardTitle>Requests by Month</CardTitle><Button variant="outline" size="sm" onClick={onToggleOrientation}>{horizontal ? 'Vertical' : 'Horizontal'}</Button></CardHeader><CardContent className="flex min-h-0 flex-1">{data.length ? <div className="min-h-0 flex-1"><ResponsiveContainer width="100%" height="100%">{horizontal ? <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 18, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" opacity={0.12} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="month" width={68} tick={{ fontSize: 11 }} /><Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} contentStyle={{ borderRadius: 8 }} /><Bar dataKey="requests" name="Requests" fill="#10b981" radius={[0, 5, 5, 0]} /></BarChart> : <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.12} /><XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} contentStyle={{ borderRadius: 8 }} /><Bar dataKey="requests" name="Requests" fill="#10b981" radius={[5, 5, 0, 0]} /></BarChart>}</ResponsiveContainer></div> : <p className="flex flex-1 items-center justify-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>;
}

function CsrRequestHoverSummary({ request }: { request: CsrRequest }) {
  const fields: Array<[string, string]> = [
    ['Date Requested', request.dateRequested],
    ['Program Type', request.programType],
    ['Requestee', request.requestee],
    ['Designation', request.designation],
    ['Organization', request.organization],
    ['Project Details', request.projectDetails],
    ['Municipality', request.municipality],
    ['Barangay', request.barangay],
    ['District', request.district],
    ['PJRS', request.pjrs],
    ['Evaluation Status', request.status],
    ['Evaluation Result', request.evaluationResult.length ? request.evaluationResult.join(', ') : 'Not Evaluated'],
    ['Approval Status', summaryApprovalStatus(request)],
    ['With Letter Reply', request.withLetterReply ? 'Yes' : 'No'],
    ['Date Approved/Disapproved', request.dateApproved],
    ['Date Released', request.dateReleased],
    ['Amount Funding', money.format(Number(request.amountFunding) || 0)],
    ['Actual Project Cost', money.format(Number(request.actualProjectCost) || 0)],
    ['Pending Reason', request.pendingReason],
    ['Additional Remarks', request.additionalRemarks],
  ];
  return <div className="pointer-events-none fixed right-8 top-24 z-50 hidden w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-surface p-4 shadow-2xl md:block"><div className="mb-3 border-b border-slate-200 pb-2"><p className="text-sm font-semibold text-slate-900">CSR Request Details</p><p className="truncate text-xs text-slate-500">{request.requestee || request.programType}</p></div><dl className="max-h-[70vh] space-y-2 overflow-y-auto pr-1 text-sm">{fields.map(([field, value]) => <div key={field} className="grid grid-cols-[135px_1fr] gap-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{field}</dt><dd className="whitespace-pre-wrap break-words text-slate-700">{value || '—'}</dd></div>)}</dl></div>;
}
