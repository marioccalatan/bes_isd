import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isWithinInterval, addDays, startOfDay } from 'date-fns';
import {
  ListChecks, ClipboardCheck, MailWarning, CalendarClock, RotateCcw, Plus, ChevronRight, Eye, Gauge,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { EnterpriseCalendar } from '@/components/shared/EnterpriseCalendar';
import { GmKpiDashboard } from '@/components/shared/GmKpiDashboard';
import { DeptKpiDashboard, hasDeptKpi } from '@/components/shared/DeptKpiDashboard';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate, processLabel } from '@/lib/utils';
import { QUICK_CREATE_ITEMS } from '@/lib/services';
import { canApprove } from '@/lib/permissions';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workItems, news, newsReadStates, events, departments, employees } = useData();
  const { effectiveRole, previewDepartmentId } = useRolePreview();
  const [showKpi, setShowKpi] = useState(false);

  const previewDept = effectiveRole === 'Department Manager' && previewDepartmentId ? departments.find((d) => d.id === previewDepartmentId) : null;
  const previewManager = previewDept ? employees.find((e) => e.id === previewDept.managerId) : null;
  const displayFirstName = previewManager?.firstName ?? user?.firstName ?? CURRENT_EMPLOYEE.firstName;
  const displayPosition = previewManager?.position ?? user?.position ?? CURRENT_EMPLOYEE.position;
  const displayDeptLine = previewDept ? `${previewDept.shortName} — ${previewDept.name}` : `${user?.departmentCode ?? CURRENT_EMPLOYEE.departmentId} — Institutional Services Department`;

  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const myIds = new Set([user?.username, user?.employeeNo, CURRENT_EMPLOYEE.id].filter(Boolean).map(String));

  const myApprovals = canApprove(effectiveRole)
    ? workItems.filter((w) => w.status === 'Pending Approval' && w.approvalChain.some((s) => s.status === 'Pending'))
    : [];
  const myTasksDueToday = workItems.filter((w) => (myIds.has(w.requestorId) || (w.assigneeId && myIds.has(w.assigneeId))) && w.dueDate && startOfDay(new Date(w.dueDate)).getTime() === today.getTime());
  const unreadMemos = news.filter((p) => !newsReadStates.find((r) => r.postId === p.id)?.read);
  const upcomingEvents = events.filter((e) => isWithinInterval(new Date(e.start), { start: today, end: weekEnd }));
  const returnedRequests = workItems.filter((w) => myIds.has(w.requestorId) && w.status === 'Returned');
  const requiresAck = news.filter((p) => p.requiresAcknowledgment && !newsReadStates.find((r) => r.postId === p.id)?.acknowledged);
  const deadlinesThisWeek = workItems.filter((w) => w.dueDate && isWithinInterval(new Date(w.dueDate), { start: today, end: weekEnd }));

  const summaryCards = [
    { label: 'Tasks Due Today', count: myTasksDueToday.length, icon: ListChecks, color: 'text-brand-600 bg-brand-50', to: '/my-work?tab=tasks' },
    { label: 'Pending Approvals', count: myApprovals.length, icon: ClipboardCheck, color: 'text-gold-700 bg-gold-50', to: '/my-work?tab=approvals' },
    { label: 'Unread Memos', count: unreadMemos.length, icon: MailWarning, color: 'text-green-700 bg-green-50', to: '/news' },
    { label: 'Upcoming Events', count: upcomingEvents.length, icon: CalendarClock, color: 'text-brand-600 bg-brand-50', to: '/calendar' },
    { label: 'Returned Requests', count: returnedRequests.length, icon: RotateCcw, color: 'text-red-600 bg-red-50', to: '/my-work?tab=tasks' },
  ];

  const recentNews = useMemo(() => news.slice(0, 6), [news]);

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${displayFirstName}`}
        description={`${displayPosition} · ${displayDeptLine}`}
        actions={<Button onClick={() => navigate('/services')}><Plus className="h-4 w-4" /> Quick Create</Button>}
      />
      {previewDept && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 px-4 py-2.5 text-sm text-gold-800">
          <Eye className="h-4 w-4 shrink-0" /> Role Preview — showing Enterprise Home as the {previewDept.name} manager. Task and approval counts below still reflect sample demonstration data.
        </div>
      )}

      {(effectiveRole === 'General Manager' || (effectiveRole === 'Department Manager' && previewDept && hasDeptKpi(previewDept.id))) && (
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-surface px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Gauge className="h-4 w-4 text-brand-600" /> KPI Dashboard
            </span>
            <Switch checked={showKpi} onChange={setShowKpi} label={showKpi ? 'Shown' : 'Hidden'} />
          </div>
          {showKpi && (
            <div className="mt-3">
              {effectiveRole === 'General Manager' ? <GmKpiDashboard /> : <DeptKpiDashboard departmentId={previewDept!.id} />}
            </div>
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryCards.map((c) => (
          <button key={c.label} onClick={() => navigate(c.to)} className="rounded-xl border border-slate-200 bg-surface p-3.5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${c.color}`}>
              <c.icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.count}</p>
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
          </button>
        ))}
      </div>

      <Card className="mb-5">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Enterprise Calendar</CardTitle>
          <button onClick={() => navigate('/calendar')} className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
            Open full calendar <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </CardHeader>
        <CardContent>
          <EnterpriseCalendar size="large" />
        </CardContent>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>My Work</CardTitle>
            <button onClick={() => navigate('/my-work')} className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
              View all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkSection title="Pending Approvals" items={myApprovals.slice(0, 3)} onNavigate={navigate} empty="No items awaiting your approval." />
            <WorkSection title="Recently Returned" items={returnedRequests.slice(0, 3)} onNavigate={navigate} empty="No returned requests." />
            <WorkSection title="Deadlines This Week" items={deadlinesThisWeek.slice(0, 3)} onNavigate={navigate} empty="No deadlines within the next 7 days." />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>News, Memos &amp; Advisories</CardTitle>
              <button onClick={() => navigate('/news')} className="flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentNews.map((post) => {
                const state = newsReadStates.find((r) => r.postId === post.id);
                return (
                  <button key={post.id} onClick={() => navigate(`/news/${post.id}`)} className="flex w-full flex-col items-start gap-1 rounded-lg p-2.5 text-left hover:bg-slate-50">
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        {!state?.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-label="Unread" />}
                        <Badge>{post.category}</Badge>
                      </span>
                      <PriorityBadge priority={post.priority} />
                    </span>
                    <span className={`text-sm ${!state?.read ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>{post.title}</span>
                    <span className="text-xs text-slate-400">{post.issuingOffice} · {formatDate(post.date)}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Awaiting Acknowledgment</CardTitle></CardHeader>
            <CardContent>
              {requiresAck.length === 0 ? (
                <EmptyState title="All caught up" description="No memos currently require your acknowledgment." />
              ) : (
                <div className="space-y-1.5">
                  {requiresAck.map((p) => (
                    <button key={p.id} onClick={() => navigate(`/news/${p.id}`)} className="flex w-full items-center justify-between rounded-lg border border-gold-200 bg-gold-50 p-2.5 text-left text-xs">
                      <span className="font-medium text-gold-900">{p.title}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-gold-500" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Quick Employee Services</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {QUICK_CREATE_ITEMS.map((s) => (
              <button key={s.id} onClick={() => navigate(s.processType ? `/requests/new/${s.processType}` : s.to)} className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-3 text-center hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><s.icon className="h-4.5 w-4.5" /></div>
                <span className="text-xs font-medium text-slate-700">{s.name}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkSection({ title, items, onNavigate, empty }: { title: string; items: { id: string; title: string; status: string; priority: 'Low' | 'Normal' | 'High' | 'Urgent' }[]; onNavigate: (to: string) => void; empty: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.map((w) => (
            <button key={w.id} onClick={() => onNavigate(`/my-work/${w.id}`)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 p-2 text-left hover:bg-slate-50">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{w.title}</span>
              <PriorityBadge priority={w.priority} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
