import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate } from '@/lib/utils';
import type { WorkItem } from '@/lib/types';

const LEAVE_BALANCES = [
  { type: 'Vacation Leave', total: 15, used: 5, label: 'VL' },
  { type: 'Sick Leave', total: 15, used: 2, label: 'SL' },
  { type: 'Special Privilege Leave', total: 3, used: 0, label: 'SPL' },
];

export default function Leave() {
  const { workItems } = useData();
  const navigate = useNavigate();
  const leaveRequests = workItems.filter((w) => w.processType === 'leave' && w.requestorId === CURRENT_EMPLOYEE.id);

  const columns: Column<WorkItem>[] = [
    { key: 'id', header: 'Reference No.', render: (w) => <span className="font-mono text-xs text-brand-700">{w.id}</span> },
    { key: 'title', header: 'Leave Type', render: (w) => w.title },
    { key: 'dateFrom', header: 'Inclusive Dates', render: (w) => `${formatDate(w.fields.dateFrom as string)} – ${formatDate(w.fields.dateTo as string)}` },
    { key: 'workingDays', header: 'Days', render: (w) => String(w.fields.workingDays ?? '—') },
    { key: 'dateSubmitted', header: 'Date Filed', render: (w) => formatDate(w.dateSubmitted) },
    { key: 'status', header: 'Status', render: (w) => <StatusBadge status={w.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Leave credit balances, requests, and history."
        crumbs={[{ label: 'Employee Services', to: '/services' }, { label: 'Leave' }]}
        actions={<Button onClick={() => navigate('/requests/new/leave')}><Plus className="h-4 w-4" /> File Leave Request</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {LEAVE_BALANCES.map((b) => {
          const remaining = b.total - b.used;
          const pct = (remaining / b.total) * 100;
          return (
            <Card key={b.type} className="p-4">
              <p className="text-xs font-medium text-slate-500">{b.type}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{remaining} <span className="text-sm font-normal text-slate-400">/ {b.total} days</span></p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{b.used} days used this year</p>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="pt-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Request History</h2>
          <DataTable
            columns={columns}
            rows={leaveRequests}
            getRowId={(w) => w.id}
            onRowClick={(w) => navigate(`/my-work/${w.id}`)}
            cardTitle={(w) => w.title}
            emptyTitle="No leave requests yet"
            emptyDescription="File your first leave request using the button above."
          />
        </CardContent>
      </Card>
    </div>
  );
}
