import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, Star, Send, FileEdit, Trash2, Pencil, Search, Paperclip,
  Reply, ArrowLeft, MessageSquarePlus, Users, X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { cn, formatDateTime, initials, timeAgo } from '@/lib/utils';
import type { EmailFolder, EmailMessage } from '@/lib/types';

const FOLDERS: { key: EmailFolder; label: string; icon: typeof InboxIcon }[] = [
  { key: 'inbox', label: 'Inbox', icon: InboxIcon },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileEdit },
  { key: 'trash', label: 'Trash', icon: Trash2 },
];

function ComposeDialog({
  open, onClose, initial,
}: { open: boolean; onClose: () => void; initial?: { toNames: string[]; subject: string; body: string; id?: string } }) {
  const { employees, sendEmail, saveEmailDraft } = useData();
  const { toast } = useToast();
  const [to, setTo] = useState(initial?.toNames.join(', ') ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [attach, setAttach] = useState<string | null>(null);
  const [error, setError] = useState('');

  function reset() {
    setTo(''); setSubject(''); setBody(''); setAttach(null); setError('');
  }

  function parseNames(v: string) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }

  function handleSend() {
    const toNames = parseNames(to);
    if (toNames.length === 0 || !subject.trim() || !body.trim()) {
      setError('Please provide at least one recipient, a subject, and a message.');
      return;
    }
    sendEmail(toNames, [], subject.trim(), body.trim(), attach ? [attach] : []);
    toast({ kind: 'success', title: 'Email sent', description: `Your message to ${toNames.join(', ')} was sent.` });
    reset();
    onClose();
  }

  function handleSaveDraft() {
    saveEmailDraft({ id: initial?.id, toNames: parseNames(to), ccNames: [], subject: subject.trim(), body: body.trim() });
    toast({ kind: 'success', title: 'Draft saved' });
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => { onClose(); }}
      title="Compose Email"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4" /> Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft}><FileEdit className="h-4 w-4" /> Save as Draft</Button>
          <Button onClick={handleSend}><Send className="h-4 w-4" /> Send</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label htmlFor="mail-to" required>To</Label>
          <Input id="mail-to" list="employee-directory" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Type a name, comma-separated for multiple" />
          <datalist id="employee-directory">
            {employees.map((e) => <option key={e.id} value={e.name} />)}
          </datalist>
        </div>
        <div>
          <Label htmlFor="mail-subject" required>Subject</Label>
          <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="mail-body" required>Message</Label>
          <Textarea id="mail-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[160px]" />
        </div>
        <div>
          <Label htmlFor="mail-attach">Attachment</Label>
          <input id="mail-attach" type="file" onChange={(e) => setAttach(e.target.files?.[0]?.name ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
          {attach && <p className="mt-1 text-xs text-green-700">Attached: {attach}</p>}
        </div>
        {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

function MailView({ autoCompose }: { autoCompose: boolean }) {
  const { emails, markEmailRead, toggleEmailStar, moveEmailToFolder, permanentlyDeleteEmail, replyToEmail } = useData();
  const { toast } = useToast();
  const [folder, setFolder] = useState<EmailFolder>('inbox');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(autoCompose);
  const [replyBody, setReplyBody] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmailMessage | null>(null);
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  const folderCounts: Record<EmailFolder, number> = {
    inbox: emails.filter((m) => m.folder === 'inbox').length,
    starred: emails.filter((m) => m.starred && m.folder !== 'trash').length,
    sent: emails.filter((m) => m.folder === 'sent').length,
    drafts: emails.filter((m) => m.folder === 'drafts').length,
    trash: emails.filter((m) => m.folder === 'trash').length,
  };
  const unreadInInbox = emails.filter((m) => m.folder === 'inbox' && !m.read).length;

  const folderEmails = useMemo(() => {
    const base = folder === 'starred' ? emails.filter((m) => m.starred && m.folder !== 'trash') : emails.filter((m) => m.folder === folder);
    const q = search.trim().toLowerCase();
    const filtered = q ? base.filter((m) => m.subject.toLowerCase().includes(q) || m.fromName.toLowerCase().includes(q) || m.body.toLowerCase().includes(q)) : base;
    return filtered.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [emails, folder, search]);

  const selected = emails.find((m) => m.id === selectedId) ?? null;

  function openMessage(m: EmailMessage) {
    setSelectedId(m.id);
    setReplyBody('');
    setShowDetailMobile(true);
    if (!m.read) markEmailRead(m.id);
  }

  function handleReply() {
    if (!selected || !replyBody.trim()) return;
    replyToEmail(selected.id, replyBody.trim());
    setReplyBody('');
    toast({ kind: 'success', title: 'Reply sent' });
  }

  function handleDelete(m: EmailMessage) {
    if (m.folder === 'trash') {
      setDeleteTarget(m);
    } else {
      moveEmailToFolder(m.id, 'trash');
      toast({ kind: 'info', title: 'Moved to Trash' });
      if (selectedId === m.id) setSelectedId(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[180px_1fr]">
      {/* Folders */}
      <div className={cn('space-y-1', showDetailMobile && 'hidden lg:block')}>
        <Button className="mb-2 w-full" onClick={() => setComposeOpen(true)}><Pencil className="h-4 w-4" /> Compose</Button>
        {FOLDERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFolder(f.key); setSelectedId(null); }}
            className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium', folder === f.key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}
          >
            <span className="flex items-center gap-2"><f.icon className="h-4 w-4" /> {f.label}</span>
            {f.key === 'inbox' && unreadInInbox > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadInInbox}</span>}
            {f.key !== 'inbox' && folderCounts[f.key] > 0 && <span className="text-xs text-slate-400">{folderCounts[f.key]}</span>}
          </button>
        ))}
      </div>

      <div className={cn('grid gap-4', selected ? 'md:grid-cols-[minmax(0,320px)_1fr]' : 'grid-cols-1')}>
        {/* Message list */}
        <div className={cn(showDetailMobile && selected && 'hidden md:block')}>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mail…" className="pl-8" aria-label="Search mail" />
          </div>
          {folderEmails.length === 0 ? (
            <EmptyState title="No messages" description={`This folder is empty.`} />
          ) : (
            <div className="space-y-1">
              {folderEmails.map((m) => (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openMessage(m)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMessage(m); } }}
                  className={cn(
                    'flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    selectedId === m.id ? 'border-brand-300 bg-brand-50/50' : 'border-transparent hover:bg-slate-50',
                    !m.read && m.folder === 'inbox' && 'bg-brand-50/20'
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className={cn('flex items-center gap-1.5 truncate text-sm', !m.read && m.folder === 'inbox' ? 'font-bold text-slate-900' : 'font-medium text-slate-700')}>
                      {!m.read && m.folder === 'inbox' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
                      {m.folder === 'sent' || m.folder === 'drafts' ? `To: ${m.toNames.join(', ')}` : m.fromName}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); toggleEmailStar(m.id); }} aria-label={m.starred ? 'Unstar' : 'Star'} className="shrink-0">
                      <Star className={cn('h-3.5 w-3.5', m.starred ? 'fill-gold-500 text-gold-500' : 'text-slate-300')} />
                    </button>
                  </span>
                  <span className="w-full truncate text-sm text-slate-800">{m.subject || '(no subject)'}</span>
                  <span className="flex w-full items-center justify-between text-xs text-slate-400">
                    <span className="truncate">{m.body.slice(0, 50)}</span>
                    <span className="ml-2 shrink-0">{timeAgo(m.timestamp)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {selected && (
          <Card className={cn('flex flex-col', !showDetailMobile && 'hidden md:flex')}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
              <div className="min-w-0">
                <button onClick={() => setShowDetailMobile(false)} className="mb-2 flex items-center gap-1 text-xs font-medium text-slate-500 md:hidden">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to list
                </button>
                <h2 className="text-base font-semibold text-slate-900">{selected.subject || '(no subject)'}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium">{selected.fromName}</span> to {selected.toNames.join(', ')}
                </p>
                <p className="text-xs text-slate-400">{formatDateTime(selected.timestamp)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={() => toggleEmailStar(selected.id)} aria-label="Toggle star">
                  <Star className={cn('h-4 w-4', selected.starred ? 'fill-gold-500 text-gold-500' : '')} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(selected)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{selected.body}</p>
              {selected.attachments.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {selected.attachments.map((a) => (
                    <button key={a} onClick={() => toast({ kind: 'info', title: 'Simulated download', description: `${a} would download in production.` })} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-brand-600 hover:bg-slate-50">
                      <Paperclip className="h-4 w-4" /> {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected.folder !== 'drafts' && (
              <div className="border-t border-slate-100 p-4">
                <Label htmlFor="reply-body">Reply</Label>
                <div className="flex items-start gap-2">
                  <Textarea id="reply-body" value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder={`Reply to ${selected.fromName}…`} className="min-h-[60px] flex-1" />
                  <Button onClick={handleReply}><Reply className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <ComposeDialog open={composeOpen} onClose={() => setComposeOpen(false)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) { permanentlyDeleteEmail(deleteTarget.id); setSelectedId(null); toast({ kind: 'info', title: 'Email permanently deleted' }); } setDeleteTarget(null); }}
        title="Delete Permanently"
        description="This email will be permanently removed and cannot be recovered."
        confirmLabel="Delete Permanently"
        destructive
      />
    </div>
  );
}

function NewMessageDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (conversationId: string) => void }) {
  const { employees, startConversation } = useData();
  const [search, setSearch] = useState('');
  const filtered = employees.filter((e) => e.id !== CURRENT_EMPLOYEE.id && e.name.toLowerCase().includes(search.toLowerCase())).slice(0, 20);

  return (
    <Dialog open={open} onClose={onClose} title="New Message" size="sm">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search colleagues…" className="mb-3" autoFocus />
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {filtered.map((e) => (
          <button
            key={e.id}
            onClick={() => { const conv = startConversation(e.id, e.name); onCreated(conv.id); onClose(); setSearch(''); }}
            className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-100"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{initials(e.name)}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">{e.name}</span>
              <span className="block truncate text-xs text-slate-500">{e.position}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function MessagesView() {
  const { conversations, chatMessages, sendChatMessage, markConversationRead } = useData();
  const [activeId, setActiveId] = useState<string | null>(conversations[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [showThreadMobile, setShowThreadMobile] = useState(false);

  const conversationSummaries = useMemo(() => {
    return conversations.map((c) => {
      const msgs = chatMessages.filter((m) => m.conversationId === c.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const last = msgs[msgs.length - 1];
      const unread = msgs.filter((m) => m.senderId !== CURRENT_EMPLOYEE.id && !m.read).length;
      return { conv: c, last, unread };
    }).sort((a, b) => (b.last?.timestamp ?? '').localeCompare(a.last?.timestamp ?? ''));
  }, [conversations, chatMessages]);

  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const activeMessages = useMemo(
    () => chatMessages.filter((m) => m.conversationId === activeId).sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [chatMessages, activeId]
  );

  function openConversation(id: string) {
    setActiveId(id);
    setShowThreadMobile(true);
    markConversationRead(id);
  }

  function handleSend() {
    if (!activeId || !draft.trim()) return;
    sendChatMessage(activeId, draft.trim());
    setDraft('');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className={cn(showThreadMobile && 'hidden lg:block')}>
        <Button className="mb-3 w-full" onClick={() => setNewMsgOpen(true)}><MessageSquarePlus className="h-4 w-4" /> New Message</Button>
        {conversationSummaries.length === 0 ? (
          <EmptyState title="No conversations" description="Start a new message to a colleague." />
        ) : (
          <div className="space-y-1">
            {conversationSummaries.map(({ conv, last, unread }) => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                className={cn('flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left', activeId === conv.id ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', conv.isGroup ? 'bg-gold-100 text-gold-700' : 'bg-brand-100 text-brand-700')}>
                  {conv.isGroup ? <Users className="h-4 w-4" /> : initials(conv.participantNames[0])}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-semibold text-slate-800">{conv.title ?? conv.participantNames[0]}</span>
                    {last && <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(last.timestamp)}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs text-slate-500">{last ? `${last.senderId === CURRENT_EMPLOYEE.id ? 'You: ' : ''}${last.body}` : 'No messages yet'}</span>
                    {unread > 0 && <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Card className={cn('flex min-h-[420px] flex-col', !showThreadMobile && 'hidden lg:flex')}>
        {activeConv ? (
          <>
            <div className="flex items-center gap-2.5 border-b border-slate-100 p-3.5">
              <button onClick={() => setShowThreadMobile(false)} className="mr-1 text-slate-500 lg:hidden" aria-label="Back to conversations">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', activeConv.isGroup ? 'bg-gold-100 text-gold-700' : 'bg-brand-100 text-brand-700')}>
                {activeConv.isGroup ? <Users className="h-4 w-4" /> : initials(activeConv.participantNames[0])}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{activeConv.title ?? activeConv.participantNames[0]}</p>
                {activeConv.isGroup && <p className="truncate text-xs text-slate-400">{activeConv.participantNames.join(', ')}</p>}
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {activeMessages.length === 0 ? (
                <EmptyState title="No messages yet" description="Send the first message below." />
              ) : (
                activeMessages.map((m) => {
                  const mine = m.senderId === CURRENT_EMPLOYEE.id;
                  return (
                    <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                      {!mine && activeConv.isGroup && <span className="mb-0.5 text-[10px] font-medium text-slate-400">{m.senderName}</span>}
                      <span className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800')}>
                        {m.body}
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-400">{timeAgo(m.timestamp)}</span>
                    </div>
                  );
                })
              )}
            </div>
            <div className="flex items-end gap-2 border-t border-slate-100 p-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type a message…"
                className="min-h-[42px] flex-1 resize-none"
                aria-label="Message input"
              />
              <Button onClick={handleSend} disabled={!draft.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </>
        ) : (
          <EmptyState title="Select a conversation" description="Choose a conversation from the list or start a new message." />
        )}
      </Card>

      <NewMessageDialog open={newMsgOpen} onClose={() => setNewMsgOpen(false)} onCreated={(id) => { openConversation(id); }} />
    </div>
  );
}

export default function InboxPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState('mail');
  return (
    <div>
      <PageHeader title="Inbox" description="Internal email and messaging for BENECO staff." crumbs={[{ label: 'Inbox' }]} />
      <Tabs tabs={[{ value: 'mail', label: 'Mail' }, { value: 'messages', label: 'Messages' }]} value={tab} onChange={setTab} className="mb-4" />
      {tab === 'mail' ? <MailView autoCompose={searchParams.get('compose') === '1'} /> : <MessagesView />}
    </div>
  );
}
