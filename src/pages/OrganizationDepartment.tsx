import { useNavigate, useParams } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { initials } from '@/lib/utils';
import NotFound from './NotFound';

export default function OrganizationDepartment() {
  const { deptId } = useParams<{ deptId: string }>();
  const { departments, employees } = useData();
  const navigate = useNavigate();
  const dept = departments.find((d) => d.id === deptId);
  if (!dept) return <NotFound />;

  const manager = employees.find((e) => e.id === dept.managerId);
  const staff = employees.filter((e) => e.departmentId === dept.id && e.id !== dept.managerId);

  return (
    <div>
      <PageHeader title={dept.name} description={dept.mandate} crumbs={[{ label: 'Organization', to: '/organization' }, { label: dept.shortName }]} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Units</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {dept.units.map((u) => <Badge key={u} className="border-brand-200 bg-brand-50 text-brand-700">{u}</Badge>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Responsibilities</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {dept.responsibilities.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm text-slate-700"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> {r}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Sample Staff Directory</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {staff.slice(0, 8).map((e) => (
                  <button key={e.id} onClick={() => navigate(`/organization/employee/${e.id}`)} className="flex items-center gap-2.5 rounded-lg border border-slate-100 p-2.5 text-left hover:bg-slate-50">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(e.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{e.name}</span>
                      <span className="block truncate text-xs text-slate-500">{e.position}</span>
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          {manager && (
            <Card>
              <CardHeader><CardTitle>Department Manager</CardTitle></CardHeader>
              <CardContent>
                <button onClick={() => navigate(`/organization/employee/${manager.id}`)} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-slate-50">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{initials(manager.name)}</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{manager.name}</span>
                    <span className="block text-xs text-slate-500">{manager.position}</span>
                  </span>
                </button>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> {dept.contactEmail}</p>
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> Local {dept.contactLocal}</p>
              <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /> {dept.location}</p>
            </CardContent>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-500">Official Employee Count</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{dept.employeeCount}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
