import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, LayoutGrid, List, Paperclip, Plus, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Select, Input, Label, Textarea, Checkbox } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canSeeAdministration } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import type { NewsCategory, NewsPost, Priority } from '@/lib/types';

const CATEGORY_TABS: { value: string; label: string; category?: NewsCategory }[] = [
  { value: 'all', label: 'All' },
  { value: 'News', label: 'News', category: 'News' },
  { value: 'Memorandum', label: 'Memos', category: 'Memorandum' },
  { value: 'Advisory', label: 'Advisories', category: 'Advisory' },
  { value: 'Office Order', label: 'Office Orders', category: 'Office Order' },
  { value: 'Safety Bulletin', label: 'Safety', category: 'Safety Bulletin' },
  { value: 'bookmarked', label: 'Bookmarked' },
  { value: 'ack', label: 'Requires Acknowledgment' },
  { value: 'archived', label: 'Archived' },
];

export default function News() {
  const { news, newsReadStates, publishNews } = useData();
  const { effectiveRole } = useRolePreview();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [officeFilter, setOfficeFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [readFilter, setReadFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<NewsPost>>({ category: 'News', priority: 'Normal', status: 'Published', recipients: 'All Employees' });

  const isAdmin = canSeeAdministration(effectiveRole);
  const offices = Array.from(new Set(news.map((n) => n.issuingOffice)));

  const filtered = useMemo(() => {
    return news.filter((p) => {
      const state = newsReadStates.find((r) => r.postId === p.id);
      if (tab === 'bookmarked' && !state?.bookmarked) return false;
      if (tab === 'ack' && !(p.requiresAcknowledgment && !state?.acknowledged)) return false;
      if (tab === 'archived' && !p.archived) return false;
      if (!['all', 'bookmarked', 'ack', 'archived'].includes(tab) && p.category !== tab) return false;
      if (tab !== 'archived' && p.archived) return false;
      if (officeFilter !== 'All' && p.issuingOffice !== officeFilter) return false;
      if (priorityFilter !== 'All' && p.priority !== priorityFilter) return false;
      if (readFilter === 'Unread' && state?.read) return false;
      if (readFilter === 'Read' && !state?.read) return false;
      if (search.trim() && !p.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [news, newsReadStates, tab, officeFilter, priorityFilter, readFilter, search]);

  function handlePublish() {
    if (!draft.title || !draft.body) return;
    publishNews({
      category: (draft.category as NewsCategory) ?? 'News', title: draft.title!, issuingOffice: draft.issuingOffice ?? 'Institutional Services Department',
      date: new Date().toISOString().slice(0, 10), priority: (draft.priority as Priority) ?? 'Normal', recipients: draft.recipients ?? 'All Employees',
      body: draft.body!, hasAttachment: !!draft.hasAttachment, attachmentName: draft.hasAttachment ? 'Attachment.pdf' : undefined,
      requiresAcknowledgment: !!draft.requiresAcknowledgment, status: (draft.status as NewsPost['status']) ?? 'Published',
      scheduledFor: draft.status === 'Scheduled' ? draft.scheduledFor : undefined,
    });
    setComposeOpen(false);
    setDraft({ category: 'News', priority: 'Normal', status: 'Published', recipients: 'All Employees' });
  }

  return (
    <div>
      <PageHeader
        title="News and Memos"
        description="The institutional publication center for news, memoranda, and advisories."
        crumbs={[{ label: 'News and Memos' }]}
        actions={isAdmin ? <Button onClick={() => setComposeOpen(true)}><Plus className="h-4 w-4" /> New Post</Button> : undefined}
      />

      <Tabs tabs={CATEGORY_TABS} value={tab} onChange={setTab} className="mb-4" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title…" className="w-48" aria-label="Search posts" />
        <Select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} className="w-auto" aria-label="Filter by issuing office">
          <option value="All">All Offices</option>
          {offices.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="w-auto" aria-label="Filter by priority">
          <option value="All">All Priorities</option><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
        </Select>
        <Select value={readFilter} onChange={(e) => setReadFilter(e.target.value)} className="w-auto" aria-label="Filter by read status">
          <option value="All">Read &amp; Unread</option><option value="Unread">Unread Only</option><option value="Read">Read Only</option>
        </Select>
        <div className="ml-auto flex rounded-md border border-slate-300 p-0.5">
          <button onClick={() => setViewMode('card')} aria-label="Card view" className={`rounded p-1.5 ${viewMode === 'card' ? 'bg-brand-600 text-white' : 'text-slate-400'}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setViewMode('list')} aria-label="List view" className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-brand-600 text-white' : 'text-slate-400'}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No posts found" description="Try adjusting your filters or search terms." />
      ) : viewMode === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <PostCard key={p.id} post={p} onClick={() => navigate(`/news/${p.id}`)} />)}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => <PostRow key={p.id} post={p} onClick={() => navigate(`/news/${p.id}`)} />)}
        </div>
      )}

      <Dialog open={composeOpen} onClose={() => setComposeOpen(false)} title="Create Post" size="lg" footer={<><Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button><Button onClick={handlePublish}>Publish</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label required>Title</Label><Input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div><Label>Category</Label><Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as NewsCategory })}><option>News</option><option>Memorandum</option><option>Advisory</option><option>Office Order</option><option>Safety Bulletin</option><option>Emergency Notice</option></Select></div>
          <div><Label>Priority</Label><Select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></Select></div>
          <div><Label>Issuing Office</Label><Input value={draft.issuingOffice ?? ''} onChange={(e) => setDraft({ ...draft, issuingOffice: e.target.value })} placeholder="e.g. Institutional Services Department" /></div>
          <div><Label>Recipients</Label><Input value={draft.recipients ?? ''} onChange={(e) => setDraft({ ...draft, recipients: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label required>Body</Label><Textarea value={draft.body ?? ''} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="min-h-[120px]" /></div>
          <div><Label>Status</Label><Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as NewsPost['status'] })}><option>Published</option><option>Scheduled</option><option>Draft</option></Select></div>
          {draft.status === 'Scheduled' && <div><Label>Scheduled For</Label><Input type="date" value={draft.scheduledFor ?? ''} onChange={(e) => setDraft({ ...draft, scheduledFor: e.target.value })} /></div>}
          <label className="flex items-center gap-2 text-sm text-slate-600"><Checkbox checked={!!draft.hasAttachment} onChange={(e) => setDraft({ ...draft, hasAttachment: e.target.checked })} /> Include mock attachment</label>
          <label className="flex items-center gap-2 text-sm text-slate-600"><Checkbox checked={!!draft.requiresAcknowledgment} onChange={(e) => setDraft({ ...draft, requiresAcknowledgment: e.target.checked })} /> Requires acknowledgment</label>
        </div>
      </Dialog>
    </div>
  );
}

function PostCard({ post, onClick }: { post: NewsPost; onClick: () => void }) {
  const { newsReadStates } = useData();
  const state = newsReadStates.find((r) => r.postId === post.id);
  return (
    <Card role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} className="flex cursor-pointer flex-col gap-2 p-4 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <div className="flex items-center justify-between gap-2">
        <Badge>{post.category}</Badge>
        <PriorityBadge priority={post.priority} />
      </div>
      <p className={`text-sm ${!state?.read ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>{post.title}</p>
      <p className="text-xs text-slate-400">{post.issuingOffice} · {formatDate(post.date)}</p>
      <div className="mt-auto flex items-center gap-2 pt-1 text-slate-400">
        {!state?.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" aria-label="Unread" />}
        {state?.bookmarked && <Bookmark className="h-3.5 w-3.5 fill-gold-500 text-gold-500" />}
        {post.hasAttachment && <Paperclip className="h-3.5 w-3.5" />}
        {post.requiresAcknowledgment && (state?.acknowledged ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Badge className="border-gold-200 bg-gold-50 text-gold-800">Ack. required</Badge>)}
      </div>
    </Card>
  );
}

function PostRow({ post, onClick }: { post: NewsPost; onClick: () => void }) {
  const { newsReadStates } = useData();
  const state = newsReadStates.find((r) => r.postId === post.id);
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-surface p-3 text-left hover:bg-brand-50/30">
      {!state?.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
      <Badge className="shrink-0">{post.category}</Badge>
      <span className={`min-w-0 flex-1 truncate text-sm ${!state?.read ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{post.title}</span>
      <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{post.issuingOffice}</span>
      <span className="shrink-0 text-xs text-slate-400">{formatDate(post.date)}</span>
      <PriorityBadge priority={post.priority} />
    </button>
  );
}
