import { useSearchParams } from 'react-router-dom';
import { CalendarClock, Download } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EnterpriseCalendar } from '@/components/shared/EnterpriseCalendar';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';

export default function CalendarPage() {
  const [searchParams] = useSearchParams();
  const { events } = useData();
  const { toast } = useToast();
  const autoOpenNew = searchParams.get('new') === '1';

  const deadlines = events
    .filter((e) => (e.layer === 'Compliance' || e.layer === 'Management') && isAfter(parseISO(e.start), new Date()))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="The full enterprise calendar module — month, week, and agenda views across all activity layers."
        crumbs={[{ label: 'Calendar' }]}
        actions={<Button variant="outline" onClick={() => toast({ kind: 'info', title: 'Simulated export', description: 'Calendar_Export.ics would download in a production system.' })}><Download className="h-4 w-4" /> Export</Button>}
      />
      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardContent className="pt-5">
            <EnterpriseCalendar autoOpenNew={autoOpenNew} />
          </CardContent>
        </Card>
        <div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" /> Upcoming Deadlines</CardTitle></CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <EmptyState title="No upcoming deadlines" description="Compliance and management deadlines will appear here." />
              ) : (
                <ul className="space-y-2.5">
                  {deadlines.map((d) => (
                    <li key={d.id} className="rounded-lg border border-slate-100 p-2.5">
                      <p className="text-sm font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-400">{format(parseISO(d.start), 'MMM d, yyyy')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
