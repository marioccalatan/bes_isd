import { useState } from 'react';
import {
  PlayCircle, Rocket, BookOpen, HelpCircle, MessageSquare, Send, Ticket, ChevronDown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useUI } from '@/context/UIContext';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { formatDate } from '@/lib/utils';
import type { SupportTicket } from '@/lib/types';

const TABS = [
  { value: 'start', label: 'Getting Started' },
  { value: 'faq', label: 'FAQ' },
  { value: 'guide', label: 'User Guide' },
  { value: 'videos', label: 'Video Tutorials' },
  { value: 'contact', label: 'Contact & Tickets' },
];

const FAQS = [
  { q: 'How do I file a leave request?', a: 'Go to Employee Services → Leave, then select "File Leave Request." Complete the form and submit — you can also save it as a draft first.' },
  { q: 'How do I know if my request was approved?', a: 'Check My Work → My Requests for the current status, or watch for a notification once your approver takes action.' },
  { q: 'Can I edit a request after submitting it?', a: 'You can edit a request while it is in Draft or Returned status. Once submitted for approval, it can no longer be edited unless returned.' },
  { q: 'How do I acknowledge a memo?', a: 'Open the memo from News and Memos, then click "Acknowledge" if the post requires it.' },
  { q: 'Who can approve my requests?', a: 'Approval routing depends on the process — most requests route to your immediate supervisor or department manager first.' },
  { q: 'How do I preview the system as a different role?', a: 'Use "View BES As" in your profile menu (top right) to preview the system from another role\'s perspective.' },
];

const GUIDE_SECTIONS = [
  { title: '1. Signing In', body: 'Use your BES credentials on the login page. Enable "Remember me" to stay signed in on this device.' },
  { title: '2. Navigating BES', body: 'Use the left sidebar (or the menu icon on mobile) to move between modules. The top bar provides global search, quick create, and notifications.' },
  { title: '3. Filing a Request', body: 'Go to Employee Services, choose a service, and complete the form. You can save as draft or submit directly.' },
  { title: '4. Tracking Your Work', body: 'My Work brings together your tasks, requests, and approvals in one place with filters and search.' },
  { title: '5. Approving Requests', body: 'If you have approval authority, pending items appear under My Approvals. Approve, return, or reject with required remarks.' },
];

export default function Help() {
  const [tab, setTab] = useState('start');
  const { startTour } = useUI();
  const { addSupportTicket, supportTickets } = useData();
  const { toast } = useToast();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [formType, setFormType] = useState<SupportTicket['type']>('Support');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const myTickets = supportTickets.filter((t) => t.submittedBy === CURRENT_EMPLOYEE.name);

  function submitTicket() {
    if (!subject.trim() || !description.trim()) {
      setError('Please complete both the subject and description fields.');
      return;
    }
    addSupportTicket({ type: formType, subject: subject.trim(), description: description.trim(), submittedBy: CURRENT_EMPLOYEE.name });
    toast({ kind: 'success', title: `${formType} submitted`, description: 'Your ticket has been logged and will appear below.' });
    setSubject('');
    setDescription('');
    setError('');
  }

  return (
    <div>
      <PageHeader title="Help and Support" description="Guides, frequently asked questions, and support channels." crumbs={[{ label: 'Help and Support' }]} actions={<Button variant="outline" onClick={startTour}><PlayCircle className="h-4 w-4" /> Start Guided Tour</Button>} />

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'start' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Rocket className="h-4 w-4" /> Getting Started with BES</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">Welcome to the BENECO Enterprise System. This prototype demonstrates how a single portal can bring together your calendar, requests, approvals, and institutional communications.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {['Enterprise Home is your daily starting point.', 'Employee Services is where you file most requests.', 'My Work tracks everything you own or must act on.', 'Use global search to find anything quickly.'].map((t) => (
                <div key={t} className="flex items-start gap-2 rounded-lg border border-slate-100 p-3 text-sm text-slate-600"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" /> {t}</div>
              ))}
            </div>
            <Button onClick={startTour}><PlayCircle className="h-4 w-4" /> Take the Guided Tour</Button>
          </CardContent>
        </Card>
      )}

      {tab === 'faq' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><HelpCircle className="h-4 w-4" /> Frequently Asked Questions</CardTitle></CardHeader>
          <CardContent className="divide-y divide-slate-100">
            {FAQS.map((f) => (
              <div key={f.q} className="py-2">
                <button onClick={() => setOpenFaq(openFaq === f.q ? null : f.q)} className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium text-slate-800">
                  {f.q}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${openFaq === f.q ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === f.q && <p className="pb-2 text-sm text-slate-600">{f.a}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'guide' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> BES User Guide</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {GUIDE_SECTIONS.map((s) => (
              <div key={s.title}>
                <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                <p className="text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'videos' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {['Signing In and Navigating BES', 'Filing Your First Leave Request', 'Approving Team Requests', 'Using the Enterprise Calendar', 'Reading and Acknowledging Memos', 'Exploring Reports and Analytics'].map((title) => (
            <button key={title} onClick={() => toast({ kind: 'info', title: 'Prototype placeholder', description: 'Video tutorials will be produced for the production rollout of BES.' })} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center hover:border-brand-300 hover:bg-brand-50/40">
              <PlayCircle className="h-9 w-9 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">{title}</p>
              <p className="text-xs text-slate-400">Video tutorial placeholder</p>
            </button>
          ))}
        </div>
      )}

      {tab === 'contact' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Contact Support</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label required>Request Type</Label>
                <Select value={formType} onChange={(e) => setFormType(e.target.value as SupportTicket['type'])}>
                  <option>Support</option><option>Feedback</option><option>Problem Report</option><option>Enhancement Request</option>
                </Select>
              </div>
              <div>
                <Label required>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} invalid={!!error && !subject.trim()} />
              </div>
              <div>
                <Label required>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} invalid={!!error && !description.trim()} />
              </div>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <Button onClick={submitTicket}><Send className="h-4 w-4" /> Submit</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-4 w-4" /> My Support Tickets</CardTitle></CardHeader>
            <CardContent>
              {myTickets.length === 0 ? (
                <EmptyState title="No tickets submitted" description="Tickets you submit will appear here and persist across sessions." />
              ) : (
                <div className="space-y-2">
                  {myTickets.map((t) => (
                    <div key={t.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-800">{t.subject}</p>
                        <StatusBadge status={t.status === 'Open' ? 'Submitted' : t.status === 'In Progress' ? 'In Progress' : t.status === 'Resolved' ? 'Completed' : 'Cancelled'} />
                      </div>
                      <p className="text-xs text-slate-500">{t.type} · {formatDate(t.dateSubmitted)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
