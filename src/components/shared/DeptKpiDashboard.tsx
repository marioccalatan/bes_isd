import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useData } from '@/context/DataContext';
import { formatPeso, formatDate } from '@/lib/utils';
import { StatTile, ChartBlock, useKpiChartTheme } from './kpiWidgets';
import type { DepartmentId } from '@/lib/types';

const DEPT_KPI_TITLES: Partial<Record<DepartmentId, string>> = {
  NSD: 'Network KPIs',
  PGD: 'Generation KPIs',
  NNSD: 'Billing & Collection KPIs',
  ISD: 'Workforce KPIs',
  CPD: 'Corporate Performance KPIs',
};

export function hasDeptKpi(departmentId: DepartmentId): boolean {
  return departmentId in DEPT_KPI_TITLES;
}

export function DeptKpiDashboard({ departmentId }: { departmentId: DepartmentId }) {
  const { gmKpi } = useData();
  const { barColor, barColorAlt, barColorMuted, gridStroke, tickStyle, tooltipContentStyle, tooltipLabelStyle } = useKpiChartTheme();
  const { technical, nonTechnical, financial } = gmKpi;

  const substationData = technical.substations.map((s) => ({ name: s.name.replace(' S/s', ''), Capacity: s.capacityMVA, Load: s.peakLoadMVA }));
  const customerReqData = nonTechnical.customerRequests.map((c) => ({ name: c.category, Requests: c.count }));
  const rateData = financial.pesoRates.map((r) => ({ name: r.customerClass, 'Rate (PHP/kWh)': r.rate }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{DEPT_KPI_TITLES[departmentId] ?? 'Department KPIs'}</CardTitle>
        <p className="text-xs text-slate-500">As of {formatDate(gmKpi.asOf)} — indicators scoped to this department's mandate.</p>
      </CardHeader>
      <CardContent className="space-y-5">

        {departmentId === 'NSD' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Systems Loss" value={`${technical.systemsLossPct}%`} sub={`NEA cap ${technical.systemsLossCapPct}%`} />
              <StatTile label="Power Factor" value={technical.powerFactor.toFixed(2)} sub="Target ≥ 0.90" />
              <StatTile label="Load Factor" value={`${Math.round(technical.loadFactor * 100)}%`} />
              <StatTile label="SAIFI" value={technical.saifi.toFixed(2)} sub="Interruptions / customer / yr" />
              <StatTile label="SAIDI" value={`${technical.saidi} min`} sub="Per customer / yr" />
              <StatTile label="MAIFI" value={technical.maifi.toFixed(2)} sub="Momentary / customer / yr" />
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Substation Capacity (6 Substations)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={substationData} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" tick={tickStyle} />
                  <YAxis tick={tickStyle} unit=" MVA" />
                  <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                  <Bar dataKey="Capacity" fill={barColorMuted} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Load" fill={barColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {technical.substations.map((s) => (
                  <div key={s.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="text-slate-400">{s.units}</span>
                  </div>
                ))}
              </div>
            </div>
            <ChartBlock title="Systems Loss Trend (Last 6 Months)">
              <LineChart data={technical.systemsLossTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="month" tick={tickStyle} />
                <YAxis tick={tickStyle} unit="%" />
                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                <Line type="monotone" dataKey="value" name="Systems Loss %" stroke={barColorAlt} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartBlock>
          </>
        )}

        {departmentId === 'PGD' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Mini Hydro Capacity" value={`${technical.miniHydroCapacityMW} MW`} />
            <StatTile label="Energy Produced" value={`${technical.energyProducedMWh.toLocaleString()} MWh`} sub="This month" />
          </div>
        )}

        {departmentId === 'NNSD' && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Meter Reading Status" value={`${nonTechnical.meterReadingCompletionPct}%`} sub="Completion this cycle" />
              <StatTile label="ASC Installation" value={`${nonTechnical.ascAverageDays} days`} sub="Average days to install" />
              <StatTile label="Collection Efficiency" value={`${financial.collectionEfficiencyPct}%`} />
              <StatTile label="Current Collections" value={formatPeso(financial.currentCollectionsPhp)} sub="This month" />
            </div>
            <ChartBlock title="Customer Requests by Category">
              <BarChart data={customerReqData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tick={tickStyle} />
                <YAxis type="category" dataKey="name" tick={tickStyle} width={130} />
                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                <Bar dataKey="Requests" fill={barColor} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartBlock>
            <ChartBlock title="Peso Rate per kWh by Customer Class">
              <BarChart data={rateData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="name" tick={tickStyle} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={tickStyle} unit=" ₱" />
                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} formatter={(v) => formatPeso(Number(v))} />
                <Bar dataKey="Rate (PHP/kWh)" fill={barColorAlt} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartBlock>
            <ChartBlock title="Collection Efficiency Trend (Last 6 Months)">
              <LineChart data={financial.collectionEfficiencyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="month" tick={tickStyle} />
                <YAxis tick={tickStyle} unit="%" domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} />
                <Line type="monotone" dataKey="value" name="Collection Efficiency %" stroke={barColor} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartBlock>
          </>
        )}

        {departmentId === 'ISD' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Number of Manpower" value={nonTechnical.manpowerCount.toLocaleString()} sub="Total BENECO workforce" />
          </div>
        )}

        {departmentId === 'CPD' && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Debt Ratio" value={`${financial.debtRatioPct}%`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
