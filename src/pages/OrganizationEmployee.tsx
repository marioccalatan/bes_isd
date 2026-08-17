import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Phone, MapPin, CalendarDays, Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { initials, formatDate } from '@/lib/utils';
import NotFound from './NotFound';

export default function OrganizationEmployee() {
  const { id } = useParams<{ id: string }>();
  const { employees, departments } = useData();
  const navigate = useNavigate();
  const employee = employees.find((e) => e.id === id);
  if (!employee) return <NotFound />;

  const dept = departments.find((d) => d.id === employee.departmentId);
  const supervisor = employee.supervisorId ? employees.find((e) => e.id === employee.supervisorId) : undefined;
  const reports = employees.filter((e) => e.supervisorId === employee.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Employee Profile" crumbs={[{ label: 'Organization', to: '/organization' }, { label: employee.name }]} />
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">{initials(employee.name)}</span>
            <div>
              <p className="text-lg font-bold text-slate-900">{employee.name}</p>
              <p className="text-sm text-slate-500">{employee.position}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {employee.roles.map((r) => <Badge key={r} className="border-gold-200 bg-gold-50 text-gold-800">{r}</Badge>)}
                <Badge className={employee.status === 'Active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-600'}>{employee.status}</Badge>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
            <Detail icon={Building2} label="Department" value={`${dept?.name ?? employee.departmentId} — ${employee.unit}`} />
            <Detail icon={MapPin} label="Work Location" value={employee.location} />
            <Detail icon={Mail} label="Email" value={employee.email} />
            <Detail icon={Phone} label="Contact" value={`Local ${employee.local} · ${employee.mobile}`} />
            <Detail icon={CalendarDays} label="Date Hired" value={formatDate(employee.dateHired)} />
          </dl>

          {supervisor && (
            <div className="border-t border-slate-100 py-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Reports To</p>
              <button onClick={() => navigate(`/organization/employee/${supervisor.id}`)} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(supervisor.name)}</span>
                <span className="text-sm font-medium text-slate-700">{supervisor.name} — {supervisor.position}</span>
              </button>
            </div>
          )}

          {reports.length > 0 && (
            <div className="border-t border-slate-100 py-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Direct Reports ({reports.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {reports.slice(0, 10).map((r) => (
                  <button key={r.id} onClick={() => navigate(`/organization/employee/${r.id}`)}>
                    <Badge className="border-brand-200 bg-brand-50 text-brand-700">{r.name}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}
