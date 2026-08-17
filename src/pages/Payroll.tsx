import { useState } from 'react';
import { Lock, Download, Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { formatPeso } from '@/lib/utils';
import type { Payslip } from '@/lib/types';

export default function Payroll() {
  const { payslips } = useData();
  const { toast } = useToast();
  const [periodId, setPeriodId] = useState(payslips[payslips.length - 1]?.id);
  const [viewing, setViewing] = useState<Payslip | null>(null);

  const current = payslips.find((p) => p.id === periodId) ?? payslips[payslips.length - 1];
  const grossPay = current ? current.basicPay + current.allowances.reduce((s, a) => s + a.amount, 0) : 0;
  const totalDeductions = current ? current.deductions.reduce((s, d) => s + d.amount, 0) : 0;

  function download(p: Payslip) {
    toast({ kind: 'info', title: 'Simulated download', description: `Payslip_${p.id}.pdf would download in a production system.` });
  }

  return (
    <div>
      <PageHeader title="Payroll" description="Pay period summaries, payslip history, and deductions." crumbs={[{ label: 'Employee Services', to: '/services' }, { label: 'Payroll' }]} />

      <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-medium text-gold-800">
        <Lock className="h-3.5 w-3.5 shrink-0" /> Confidential — payroll figures shown are entirely fictional mock data for demonstration purposes only.
      </div>

      <Card className="mb-5">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Current Payroll Summary</CardTitle>
          <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="w-auto" aria-label="Select pay period">
            {payslips.map((p) => <option key={p.id} value={p.id}>{p.period}</option>)}
          </Select>
        </CardHeader>
        {current && (
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Basic Pay</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{formatPeso(current.basicPay)}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-green-700">Total Allowances</p>
                <p className="mt-1 text-lg font-bold text-green-700">{formatPeso(current.allowances.reduce((s, a) => s + a.amount, 0))}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-700">Total Deductions</p>
                <p className="mt-1 text-lg font-bold text-red-700">{formatPeso(totalDeductions)}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-brand-900 p-4 text-white">
              <div>
                <p className="text-xs text-brand-200">Net Pay — {current.period}</p>
                <p className="text-2xl font-bold">{formatPeso(current.netPay)}</p>
              </div>
              <Button variant="secondary" onClick={() => download(current)}><Download className="h-4 w-4" /> Download Payslip PDF</Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Payslip History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {payslips.slice().reverse().map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{p.period}</p>
                <p className="text-xs text-slate-500">Net Pay: {formatPeso(p.netPay)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewing(p)}><Eye className="h-3.5 w-3.5" /> View</Button>
                <Button variant="outline" size="sm" onClick={() => download(p)}><Download className="h-3.5 w-3.5" /> Download</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={`Payslip — ${viewing?.period ?? ''}`} description="Mock data for demonstration only." size="md">
        {viewing && (
          <div className="space-y-3 text-sm">
            <Row label="Basic Pay" value={formatPeso(viewing.basicPay)} />
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Allowances</p>
            {viewing.allowances.map((a) => <Row key={a.label} label={a.label} value={formatPeso(a.amount)} />)}
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Deductions</p>
            {viewing.deductions.map((d) => <Row key={d.label} label={d.label} value={`- ${formatPeso(d.amount)}`} className="text-red-600" />)}
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <p className="font-semibold text-slate-800">Net Pay</p>
              <p className="text-lg font-bold text-brand-700">{formatPeso(viewing.netPay)}</p>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${className ?? 'text-slate-800'}`}>{value}</span>
    </div>
  );
}
