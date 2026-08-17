import { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Select } from '@/components/ui/input';
import { useData } from '@/context/DataContext';
import { useTheme } from '@/context/ThemeContext';
import { formatPeso } from '@/lib/utils';

const COLORS_LIGHT = ['#16a34a', '#0f8358', '#cf8f1c', '#7c3aed', '#c1272d', '#0d9488'];
const COLORS_DARK = ['#34d399', '#7ee9bf', '#f0c766', '#a78bfa', '#f87171', '#2dd4bf'];

const TABS = [
  { value: 'my-summary', label: 'My Summary' },
  { value: 'department', label: 'Department Performance' },
  { value: 'enterprise', label: 'Enterprise Performance' },
  { value: 'workforce', label: 'Workforce' },
  { value: 'service-requests', label: 'Service Requests' },
  { value: 'workflow', label: 'Workflow Efficiency' },
  { value: 'adoption', label: 'BES Adoption' },
  { value: 'strategic', label: 'Strategic Initiatives' },
  { value: 'risk', label: 'Risk and Compliance' },
];

function ChartCard({ title, children, height = 260 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const { workItems, departments, attendance, modules, projects, documents } = useData();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const COLORS = isDark ? COLORS_DARK : COLORS_LIGHT;
  const gridStroke = isDark ? '#2e3b33' : '#e2e8f0';
  const tickFill = isDark ? '#8a9c90' : '#64748b';
  const tickStyle = { fontSize: 11, fill: tickFill };
  const tooltipContentStyle = { backgroundColor: isDark ? '#131f1a' : '#ffffff', border: `1px solid ${gridStroke}`, borderRadius: 8, fontSize: 12, color: isDark ? '#e4ebe6' : '#1c2333' };
  const tooltipLabelStyle = { color: isDark ? '#e4ebe6' : '#1c2333', fontWeight: 600 };
  const tooltipItemStyle = { color: isDark ? '#c6d2cb' : '#334155' };
  const legendStyle = { fontSize: 12, color: tickFill };
  const [tab, setTab] = useState('my-summary');
  const [deptFilter, setDeptFilter] = useState('All');
  const [range, setRange] = useState('This Quarter');

  const scopedItems = deptFilter === 'All' ? workItems : workItems.filter((w) => w.departmentId === deptFilter);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedItems.forEach((w) => { counts[w.status] = (counts[w.status] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [scopedItems]);

  const deptVolume = useMemo(() => departments.map((d) => ({
    name: d.shortName,
    submitted: workItems.filter((w) => w.departmentId === d.id).length,
    completed: workItems.filter((w) => w.departmentId === d.id && (w.status === 'Completed' || w.status === 'Approved')).length,
  })), [workItems, departments]);

  const attendanceTrend = useMemo(() => attendance.map((a) => ({
    date: a.date.slice(5), present: a.status === 'Present' || a.status === 'Late' || a.status === 'Undertime' ? 1 : 0,
  })), [attendance]);

  const processVolume = useMemo(() => {
    const counts: Record<string, number> = {};
    workItems.forEach((w) => { counts[w.processType] = (counts[w.processType] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));
  }, [workItems]);

  const adoptionByDept = useMemo(() => departments.map((d) => {
    const deptModules = modules.filter((m) => m.departmentId === d.id && m.status === 'Active');
    const avg = deptModules.length ? Math.round(deptModules.reduce((s, m) => s + m.adoptionRate, 0) / deptModules.length) : Math.round(Math.random() * 40 + 30);
    return { name: d.shortName, adoption: avg };
  }), [departments, modules]);

  const projectStatus = useMemo(() => {
    const counts: Record<string, number> = { 'On Track': 0, 'At Risk': 0, Delayed: 0, Completed: 0 };
    projects.forEach((p) => { counts[p.status] += 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [projects]);

  const policyAck = useMemo(() => {
    const withAck = documents.filter((d) => d.requiresAcknowledgment).length;
    return [{ name: 'Acknowledged', value: Math.round(withAck * 0.7) }, { name: 'Pending', value: withAck - Math.round(withAck * 0.7) }];
  }, [documents]);

  const avgApprovalDays = 3.2;
  const completedThisMonth = workItems.filter((w) => w.status === 'Completed' || w.status === 'Approved').length;
  const attendanceRate = Math.round((attendance.filter((a) => a.status !== 'Absent').length / Math.max(1, attendance.length)) * 100);

  return (
    <div>
      <PageHeader title="Reports and Analytics" description="Role-based dashboards summarizing enterprise, department, and workforce performance. All figures are demonstration data." crumbs={[{ label: 'Reports and Analytics' }]} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-auto" aria-label="Date range">
          <option>This Month</option><option>This Quarter</option><option>Year to Date</option>
        </Select>
        <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-auto" aria-label="Department filter">
          <option value="All">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.shortName}</option>)}
        </Select>
        <span className="text-xs text-slate-400">Showing: {range} · {deptFilter === 'All' ? 'All Departments' : deptFilter} — demonstration data</span>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'my-summary' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <StatCard label="Pending Transactions" value={String(scopedItems.filter((w) => w.status === 'Pending Approval').length)} />
          <StatCard label="Avg. Approval Time" value={`${avgApprovalDays} days`} />
          <StatCard label="Requests Completed This Month" value={String(completedThisMonth)} />
          <div className="lg:col-span-3"><ChartCard title="My Requests by Status"><BarChart data={statusData}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="name" tick={tickStyle} /><YAxis allowDecimals={false} tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard></div>
        </div>
      )}

      {tab === 'department' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Submitted vs. Completed by Department"><BarChart data={deptVolume}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="name" tick={tickStyle} /><YAxis allowDecimals={false} tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /><Bar dataKey="submitted" fill={COLORS[0]} radius={[4, 4, 0, 0]} /><Bar dataKey="completed" fill={COLORS[1]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard>
          <ChartCard title="Department Task Completion"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
        </div>
      )}

      {tab === 'enterprise' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Enterprise Request Volume by Process"><BarChart data={processVolume} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis type="number" allowDecimals={false} tick={tickStyle} /><YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: tickFill }} width={140} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="value" fill={COLORS[3]} radius={[0, 4, 4, 0]} /></BarChart></ChartCard>
          <ChartCard title="Overall Status Distribution"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90}>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
        </div>
      )}

      {tab === 'workforce' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StatCard label="Attendance Rate" value={`${attendanceRate}%`} />
          <StatCard label="Leave Utilization" value="34%" />
          <div className="lg:col-span-2"><ChartCard title="Attendance Trend (Last 15 Working Days)"><LineChart data={attendanceTrend}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="date" tick={{ fontSize: 10, fill: tickFill }} /><YAxis domain={[0, 1]} ticks={[0, 1]} tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Line type="monotone" dataKey="present" stroke={COLORS[1]} strokeWidth={2} dot={false} /></LineChart></ChartCard></div>
        </div>
      )}

      {tab === 'service-requests' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Most-Used Services (by Process Type)"><BarChart data={processVolume}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="name" tick={{ fontSize: 9, fill: tickFill }} interval={0} angle={-25} textAnchor="end" height={70} /><YAxis allowDecimals={false} tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="value" fill={COLORS[2]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard>
          <ChartCard title="Service Request Status"><PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
        </div>
      )}

      {tab === 'workflow' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <StatCard label="Avg. Approval Time (All Processes)" value={`${avgApprovalDays} days`} />
          <StatCard label="Workflow Bottleneck" value="Budget Review Stage" />
          <div className="lg:col-span-2"><ChartCard title="Approval Stage Duration (Simulated, Days)"><BarChart data={[{ stage: 'Supervisor', days: 1.1 }, { stage: 'Dept. Manager', days: 1.4 }, { stage: 'Budget Review', days: 3.8 }, { stage: 'Procurement', days: 2.2 }, { stage: 'General Manager', days: 1.9 }]}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="stage" tick={{ fontSize: 10, fill: tickFill }} /><YAxis tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="days" fill={COLORS[4]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard></div>
        </div>
      )}

      {tab === 'adoption' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="BES Adoption Rate by Department"><RadarChart data={adoptionByDept} outerRadius={90}><PolarGrid stroke={gridStroke} /><PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: tickFill }} /><PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: tickFill }} /><Radar dataKey="adoption" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.4} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /></RadarChart></ChartCard>
          <ChartCard title="Module Status Breakdown"><PieChart><Pie data={Object.entries(modules.reduce((acc: Record<string, number>, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>{modules.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
        </div>
      )}

      {tab === 'strategic' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Strategic Initiatives by Status"><PieChart><Pie data={projectStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>{projectStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
          <ChartCard title="Project Budget Allocation (PHP)"><BarChart data={projects.map((p) => ({ name: p.title.slice(0, 14), budget: p.budget }))}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="name" tick={{ fontSize: 8, fill: tickFill }} interval={0} angle={-30} textAnchor="end" height={80} /><YAxis tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} tick={tickStyle} /><Tooltip formatter={(v) => formatPeso(Number(v))} contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="budget" fill={COLORS[1]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard>
        </div>
      )}

      {tab === 'risk' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Policy Acknowledgment Status"><PieChart><Pie data={policyAck} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>{policyAck.map((_, i) => <Cell key={i} fill={i === 0 ? COLORS[1] : COLORS[2]} />)}</Pie><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Legend wrapperStyle={legendStyle} /></PieChart></ChartCard>
          <ChartCard title="Training Completion by Department"><BarChart data={departments.map((d, i) => ({ name: d.shortName, completion: 62 + ((i * 13) % 35) }))}><CartesianGrid strokeDasharray="3 3" stroke={gridStroke} /><XAxis dataKey="name" tick={tickStyle} /><YAxis domain={[0, 100]} tick={tickStyle} /><Tooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} /><Bar dataKey="completion" fill={COLORS[3]} radius={[4, 4, 0, 0]} /></BarChart></ChartCard>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
