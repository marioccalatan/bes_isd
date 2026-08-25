import { useEffect, useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { fetchCsrRequests, type CsrRequest } from '@/lib/api';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const currentYear = new Date().getFullYear();

export default function CsrSummary() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<CsrRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchCsrRequests(token).then(setRequests).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load CSR requests.')).finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => requests.filter((request) => request.dateRequested >= startDate && request.dateRequested <= endDate), [requests, startDate, endDate]);
  const countBy = (selector: (request: CsrRequest) => string) => filtered.reduce<Record<string, number>>((result, request) => { const key = selector(request) || 'Unspecified'; result[key] = (result[key] || 0) + 1; return result; }, {});
  const status = countBy((request) => request.status);
  const policy = countBy((request) => request.evaluationResult || 'Not evaluated');
  const programs = countBy((request) => request.programType);
  const municipalities = countBy((request) => request.municipality);
  const months = countBy((request) => request.dateRequested.slice(0, 7));
  const districtMetrics = useMemo(() => Object.values(filtered.reduce<Record<string, { district: string; quantity: number; amount: number }>>((result, request) => { const district = request.district || 'Unspecified'; const row = result[district] ?? { district, quantity: 0, amount: 0 }; row.quantity += 1; row.amount += Number(request.amountFunding) || 0; result[district] = row; return result; }, {})).sort((a, b) => b.amount - a.amount || b.quantity - a.quantity || a.district.localeCompare(b.district)), [filtered]);
  const totalFunding = filtered.reduce((sum, request) => sum + (Number(request.amountFunding) || 0), 0);

  return <div>
    <div className="no-print"><PageHeader title="Corporate Social Responsibility Summary" description="CSR activity, evaluation, funding, and geographic metrics." crumbs={[{ label: 'Member-Consumer and Community Programs', to: '/workspace/member-programs' }, { label: 'CSR Summary' }]} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={() => window.close()}><X className="h-4 w-4" /> Close</Button></div>} /></div>
    <Card className="mb-5 no-print"><CardHeader><CardTitle>Reporting Period</CardTitle></CardHeader><CardContent><div className="max-w-xl"><DateRangePicker label="CSR Request Date Range" startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} /></div><p className="mt-2 text-sm text-slate-500">Metrics include requests dated {startDate} through {endDate}.</p></CardContent></Card>
    {loading ? <Card><CardContent className="py-12 text-center text-slate-500">Loading CSR metrics…</CardContent></Card> : error ? <Card><CardContent className="py-12 text-center text-red-600">{error}</CardContent></Card> : <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Requests" value={String(filtered.length)} />
        <MetricCard label="Completed" value={String(status.Completed || 0)} />
        <MetricCard label="Within CSR Policy" value={String(policy['Within CSR Policy'] || 0)} />
        <MetricCard label="Total Funding" value={money.format(totalFunding)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Status" values={status} total={filtered.length} />
        <Breakdown title="Policy Evaluation" values={policy} total={filtered.length} />
        <Breakdown title="Program Types" values={programs} total={filtered.length} />
        <Breakdown title="Municipalities" values={municipalities} total={filtered.length} />
        <Breakdown title="Requests by Month" values={months} total={filtered.length} />
        <Card><CardHeader><CardTitle>District Metrics</CardTitle><p className="text-sm text-slate-500">Request quantity and approved/requested funding by district.</p></CardHeader><CardContent>{districtMetrics.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-2">District</th><th className="py-2 text-right">Quantity</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{districtMetrics.map((row) => <tr key={row.district} className="border-b last:border-0"><td className="py-3 font-medium">{row.district}</td><td className="py-3 text-right">{row.quantity}</td><td className="py-3 text-right font-semibold">{money.format(row.amount)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 font-bold"><td className="py-3">Total</td><td className="py-3 text-right">{filtered.length}</td><td className="py-3 text-right">{money.format(totalFunding)}</td></tr></tfoot></table></div> : <p className="py-8 text-center text-sm text-slate-500">No district data for this period.</p>}</CardContent></Card>
      </div>
      <Card className="mt-5"><CardHeader><CardTitle>CSR Request Summary</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-xs"><thead><tr className="border-b text-left uppercase text-slate-500">{['Date','Program Type','Requestee','Municipality','Barangay','District','Status','Evaluation','Amount'].map((header) => <th key={header} className="p-2">{header}</th>)}</tr></thead><tbody>{filtered.map((request) => <tr key={request.id} className="border-b"><td className="p-2">{request.dateRequested}</td><td className="p-2 font-medium">{request.programType}</td><td className="p-2">{request.requestee}</td><td className="p-2">{request.municipality || '—'}</td><td className="p-2">{request.barangay || '—'}</td><td className="p-2">{request.district || '—'}</td><td className="p-2">{request.status}</td><td className="p-2">{request.evaluationResult || 'Not evaluated'}</td><td className="p-2 text-right">{money.format(Number(request.amountFunding) || 0)}</td></tr>)}</tbody></table>{!filtered.length && <p className="py-10 text-center text-sm text-slate-500">No CSR requests within the selected date range.</p>}</div></CardContent></Card>
    </>}
  </div>;
}

function MetricCard({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></CardContent></Card>; }

function Breakdown({ title, values, total }: { title: string; values: Record<string, number>; total: number }) { const rows = Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length ? <div className="space-y-3">{rows.map(([label, count]) => <div key={label}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{label}</span><strong>{count}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${total ? Math.max(3, (count / total) * 100) : 0}%` }} /></div></div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">No data for this period.</p>}</CardContent></Card>; }
