import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { fetchHrEmployees, type HrEmployee } from '@/lib/api';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#64748b'];

export default function HumanResourcesSummary() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchHrEmployees(token)
      .then((items) => { if (!cancelled) setEmployees(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load HR summary', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [toast, token]);

  const metrics = useMemo(() => {
    const now = new Date();
    const dated = employees.map((employee) => employee.dateHired ? new Date(`${employee.dateHired}T00:00:00`) : null).filter((date): date is Date => !!date && !Number.isNaN(date.valueOf()));
    const years = dated.map((date) => Math.max(0, (now.valueOf() - date.valueOf()) / 31_556_952_000));
    const recentCutoff = new Date(now); recentCutoff.setFullYear(recentCutoff.getFullYear() - 1);
    return {
      total: employees.length,
      departments: new Set(employees.map((employee) => employee.departmentShort || employee.departmentId).filter(Boolean)).size,
      positions: new Set(employees.map((employee) => employee.currentPositionType).filter(Boolean)).size,
      averageTenure: years.length ? years.reduce((sum, value) => sum + value, 0) / years.length : 0,
      hiredLast12Months: dated.filter((date) => date >= recentCutoff).length,
    };
  }, [employees]);

  const departmentData = useMemo(() => countBy(employees, (employee) => employee.departmentShort || employee.departmentId || 'Unassigned'), [employees]);
  const positionData = useMemo(() => countBy(employees, (employee) => employee.currentPositionType || 'Unspecified').slice(0, 10), [employees]);
  const levelData = useMemo(() => countBy(employees, (employee) => employee.positionLevel || 'Unspecified').sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [employees]);
  const jobLevelData = useMemo(() => countBy(employees, (employee) => {
    if (!employee.jobLevelId) return 'Unassigned';
    return employee.jobLevelDescription ? `${employee.jobLevelId} — ${employee.jobLevelDescription}` : employee.jobLevelId;
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [employees]);
  const tenureData = useMemo(() => {
    const now = new Date();
    const bands = [{ name: '< 1 year', value: 0 }, { name: '1–4 years', value: 0 }, { name: '5–9 years', value: 0 }, { name: '10–19 years', value: 0 }, { name: '20+ years', value: 0 }, { name: 'No date', value: 0 }];
    for (const employee of employees) {
      if (!employee.dateHired) { bands[5].value += 1; continue; }
      const hired = new Date(`${employee.dateHired}T00:00:00`);
      const years = (now.valueOf() - hired.valueOf()) / 31_556_952_000;
      if (years < 1) bands[0].value += 1; else if (years < 5) bands[1].value += 1; else if (years < 10) bands[2].value += 1; else if (years < 20) bands[3].value += 1; else bands[4].value += 1;
    }
    return bands.filter((band) => band.value);
  }, [employees]);
  const hiringTrend = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 10 }, (_, index) => currentYear - 9 + index);
    return years.map((year) => ({ name: String(year), value: employees.filter((employee) => employee.dateHired?.startsWith(String(year))).length }));
  }, [employees]);

  return <div>
    <PageHeader title="Human Resources Summary" description="Live workforce statistics and metrics from the active employee masterfile." crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'Human Resources', to: '/workspace/human-resources' }, { label: 'Summary' }]} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Active Employees" value={loading ? '—' : metrics.total} />
      <Metric label="Departments" value={loading ? '—' : metrics.departments} />
      <Metric label="Current Positions" value={loading ? '—' : metrics.positions} />
      <Metric label="Average Tenure" value={loading ? '—' : `${metrics.averageTenure.toFixed(1)} yrs`} />
      <Metric label="Hired in Last 12 Months" value={loading ? '—' : metrics.hiredLast12Months} />
    </div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <ChartCard title="Employees by Department"><BarChart data={departmentData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Employees" fill="#10b981" radius={[5, 5, 0, 0]} /></BarChart></ChartCard>
      <ChartCard title="Position Level Distribution"><BarChart data={levelData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Employees" fill="#3b82f6" radius={[5, 5, 0, 0]} /></BarChart></ChartCard>
      <ChartCard title="Employees by Job Level (JL_ID)" className="xl:col-span-2"><BarChart data={jobLevelData} layout="vertical" margin={{ top: 8, right: 16, left: 105, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="value" name="Employees" fill="#06b6d4" radius={[0, 5, 5, 0]} /></BarChart></ChartCard>
      <ChartCard title="Top Current Positions"><BarChart data={positionData} layout="vertical" margin={{ top: 8, right: 16, left: 65, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={135} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="value" name="Employees" fill="#8b5cf6" radius={[0, 5, 5, 0]} /></BarChart></ChartCard>
      <ChartCard title="Tenure Distribution"><PieChart><Pie data={tenureData} dataKey="value" nameKey="name" cx="50%" cy="44%" innerRadius={55} outerRadius={90} paddingAngle={2}>{tenureData.map((item, index) => <Cell key={item.name} fill={COLORS[index % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ChartCard>
      <ChartCard title="Hiring Trend — Last 10 Years" className="xl:col-span-2"><BarChart data={hiringTrend} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" name="Employees Hired" fill="#f59e0b" radius={[5, 5, 0, 0]} /></BarChart></ChartCard>
    </div>
  </div>;
}

function countBy(employees: HrEmployee[], selector: (employee: HrEmployee) => string) {
  const counts = new Map<string, number>();
  for (const employee of employees) { const key = selector(employee); counts.set(key, (counts.get(key) ?? 0) + 1); }
  return [...counts].map(([name, value]) => ({ name, value })).sort((left, right) => right.value - left.value);
}

function Metric({ label, value }: { label: string; value: string | number }) { return <Card className="p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></Card>; }
function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactElement; className?: string }) { return <Card className={className}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></CardContent></Card>; }
