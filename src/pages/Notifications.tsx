import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ClipboardCheck, RefreshCw, Newspaper, CalendarClock, UserPlus, AlarmClock, Settings, CheckCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { timeAgo } from '@/lib/utils';
import type { AppNotification, NotificationCategory } from '@/lib/types';

const ICONS: Record<NotificationCategory, typeof ClipboardCheck> = {
  'Approval Required': ClipboardCheck,
  'Request Update': RefreshCw,
  Memo: Newspaper,
  'Calendar Reminder': CalendarClock,
  Assignment: UserPlus,
  Deadline: AlarmClock,
  'System Message': Settings,
};

export default function Notifications() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | NotificationCategory>('All');
  const [showPrefs, setShowPrefs] = useState(false);

  const filtered = filter === 'All' ? notifications : notifications.filter((n) => n.category === filter);
  const unread = notifications.filter((n) => !n.read).length;

  function open(n: AppNotification) {
    markNotificationRead(n.id);
    if (n.linkType === 'work-item' && n.linkId) navigate(`/my-work/${n.linkId}`);
    else if (n.linkType === 'news' && n.linkId) navigate(`/news/${n.linkId}`);
    else if (n.linkType === 'event') navigate('/calendar');
    else if (n.linkType === 'document' && n.linkId) navigate(`/documents/${n.linkId}`);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${unread} unread notification${unread === 1 ? '' : 's'}.`}
        crumbs={[{ label: 'Notifications' }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowPrefs((v) => !v)}><Settings className="h-4 w-4" /> Preferences</Button>
            <Button variant="outline" onClick={markAllNotificationsRead}><CheckCheck className="h-4 w-4" /> Mark All Read</Button>
          </>
        }
      />

      {showPrefs && (
        <Card className="mb-4 border-brand-200 bg-brand-50/40">
          <CardContent className="pt-4 text-sm text-slate-600">
            <p className="mb-2 font-semibold text-slate-800">Notification Preferences (prototype)</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {Object.keys(ICONS).map((c) => (
                <label key={c} className="flex items-center gap-2"><input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-600" /> {c}</label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-4">
        <Select value={filter} onChange={(e) => setFilter(e.target.value as 'All' | NotificationCategory)} className="w-auto" aria-label="Filter notifications">
          <option value="All">All Categories</option>
          {Object.keys(ICONS).map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No notifications" description="You're all caught up in this category." />
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = ICONS[n.category];
            return (
              <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 rounded-lg border p-3.5 text-left transition-colors ${n.read ? 'border-slate-100 bg-surface' : 'border-brand-200 bg-brand-50/40'}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${n.read ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-600'}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm ${n.read ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{n.title}</p>
                    {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </div>
                  <p className="text-sm text-slate-500">{n.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{n.category} · {timeAgo(n.timestamp)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
