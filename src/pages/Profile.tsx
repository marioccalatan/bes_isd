import { Mail, Phone, MapPin, CalendarDays, Building2, Award } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { initials, formatDate } from '@/lib/utils';

export default function Profile() {
  const { departments } = useData();
  const dept = departments.find((d) => d.id === CURRENT_EMPLOYEE.departmentId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="My Profile" crumbs={[{ label: 'My Profile' }]} />
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col items-center gap-3 border-b border-slate-100 pb-5 text-center sm:flex-row sm:text-left">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">{initials(CURRENT_EMPLOYEE.name)}</span>
            <div>
              <p className="text-lg font-bold text-slate-900">{CURRENT_EMPLOYEE.name}</p>
              <p className="text-sm text-slate-500">{CURRENT_EMPLOYEE.position}</p>
              <p className="text-xs text-slate-400">{CURRENT_EMPLOYEE.id}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {CURRENT_EMPLOYEE.roles.map((r) => <Badge key={r} className="border-gold-200 bg-gold-50 text-gold-800">{r}</Badge>)}
                <Badge className="border-green-200 bg-green-50 text-green-700">{CURRENT_EMPLOYEE.status}</Badge>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-2">
            <Detail icon={Building2} label="Department" value={`${dept?.name ?? ''} (${CURRENT_EMPLOYEE.unit})`} />
            <Detail icon={MapPin} label="Work Location" value={CURRENT_EMPLOYEE.location} />
            <Detail icon={Mail} label="Email" value={CURRENT_EMPLOYEE.email} />
            <Detail icon={Phone} label="Contact" value={`Local ${CURRENT_EMPLOYEE.local}`} />
            <Detail icon={CalendarDays} label="Date Hired" value={formatDate(CURRENT_EMPLOYEE.dateHired)} />
            <Detail icon={Award} label="Additional Roles" value={CURRENT_EMPLOYEE.roles.join(', ')} />
          </dl>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            Profile information shown here is fictional mock data created for this management demonstration prototype.
          </div>
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
