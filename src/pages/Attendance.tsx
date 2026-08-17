import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogIn, LogOut, FileEdit, Download, Printer } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { formatDate, formatTime } from '@/lib/utils';
import { exportToCsv } from '@/hooks/useTableControls';
import type { AttendanceRecord } from '@/lib/types';

const STATUS_STYLES: Record<AttendanceRecord['status'], string> = {
  Present: 'border-green-200 bg-green-50 text-green-700',
  Late: 'border-gold-200 bg-gold-50 text-gold-800',
  Undertime: 'border-orange-200 bg-orange-50 text-orange-700',
  Absent: 'border-red-200 bg-red-50 text-red-700',
  'On Leave': 'border-brand-200 bg-brand-50 text-brand-700',
  'Official Business': 'border-brand-200 bg-brand-50 text-brand-700',
  Holiday: 'border-slate-200 bg-slate-100 text-slate-600',
};

export default function Attendance() {
  const { attendance, clockedIn, clockIn, clockOut } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const late = attendance.filter((a) => a.status === 'Late').length;
    const undertime = attendance.filter((a) => a.status === 'Undertime').length;
    const ob = attendance.filter((a) => a.status === 'Official Business').length;
    const present = attendance.filter((a) => a.status === 'Present').length;
    return { late, undertime, ob, present };
  }, [attendance]);

  const today = new Date().toISOString().slice(0, 10);
  const todayRecord = attendance.find((a) => a.date === today);

  const columns: Column<AttendanceRecord>[] = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date), sortable: true },
    { key: 'timeIn', header: 'Time In', render: (r) => (r.timeIn ? formatTime(`${r.date}T${r.timeIn}`) : '—') },
    { key: 'timeOut', header: 'Time Out', render: (r) => (r.timeOut ? formatTime(`${r.date}T${r.timeOut}`) : '—') },
    { key: 'hoursRendered', header: 'Hours', render: (r) => r.hoursRendered ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge> },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? '—', hideOnCard: true },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Time records, daily status, and attendance summaries."
        crumbs={[{ label: 'Employee Services', to: '/services' }, { label: 'Attendance' }]}
        actions={
          <Button variant="outline" onClick={() => navigate('/requests/new/attendance-correction')}>
            <FileEdit className="h-4 w-4" /> Request Correction
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Today's Status</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{clockedIn ? 'Clocked In' : todayRecord?.timeOut ? 'Completed' : 'Not Clocked In'}</p>
        </Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Present Days</p><p className="mt-1 text-lg font-bold text-green-600">{summary.present}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Late</p><p className="mt-1 text-lg font-bold text-gold-600">{summary.late}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Undertime</p><p className="mt-1 text-lg font-bold text-orange-600">{summary.undertime}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium text-slate-500">Official Business</p><p className="mt-1 text-lg font-bold text-brand-600">{summary.ob}</p></Card>
      </div>

      <Card className="mb-5">
        <CardHeader><CardTitle>Time Clock — Prototype Control</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{today && formatDate(today, 'EEEE, MMMM d, yyyy')}</p>
                <p className="text-xs text-slate-500">
                  {todayRecord?.timeIn ? `Time in: ${formatTime(`${today}T${todayRecord.timeIn}`)}` : 'No time-in recorded yet'}
                  {todayRecord?.timeOut ? ` · Time out: ${formatTime(`${today}T${todayRecord.timeOut}`)}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { clockIn(); toast({ kind: 'success', title: 'Clocked in', description: 'Your time-in has been recorded.' }); }} disabled={clockedIn}>
                <LogIn className="h-4 w-4" /> Clock In
              </Button>
              <Button variant="outline" onClick={() => { clockOut(); toast({ kind: 'success', title: 'Clocked out', description: 'Your time-out has been recorded.' }); }} disabled={!clockedIn}>
                <LogOut className="h-4 w-4" /> Clock Out
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Monthly Attendance Record</CardTitle>
          <div className="flex gap-2 no-print">
            <Button variant="outline" size="sm" onClick={() => exportToCsv('attendance.csv', ['Date', 'Time In', 'Time Out', 'Hours', 'Status', 'Remarks'], attendance.map((a) => [a.date, a.timeIn ?? '', a.timeOut ?? '', a.hoursRendered ?? '', a.status, a.remarks ?? '']))}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={attendance.slice().reverse()} getRowId={(r) => r.id} cardTitle={(r) => formatDate(r.date)} />
        </CardContent>
      </Card>
    </div>
  );
}
