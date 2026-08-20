import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadState, saveState, clearAllBesData } from '@/lib/storage';
import { randomRef } from '@/lib/utils';
import { createCalendarEvent, createCalendarTask, createWorkComment, deleteCalendarEvent as deleteOracleCalendarEvent, deleteWorkComment, fetchCalendarEvents, fetchToolRegistry, fetchWorkTasks, setCalendarEventDone, updateCalendarEvent, updateWorkComment, type CalendarTaskInput } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  DEPARTMENTS, EMPLOYEES, CURRENT_EMPLOYEE,
  buildCalendarEvents, buildNewsPosts, buildAttendance, buildPayslips,
  buildWorkItems, buildDocuments, buildProjects, buildNotifications,
  buildModules, buildAuditLog, buildSupportTickets, buildNewsReadStates,
  buildEmails, buildConversations, buildChatMessages, buildTools,
  buildStorageItems, buildStorageQuotas, DEFAULT_STORAGE_QUOTA_BYTES,
  buildQmsDocuments, buildGmKpiData,
  ORG_CHARTS, ENTERPRISE_ORG_CHART,
  resetRefCounter,
} from '@/lib/mockData';
import type {
  ActivityEntry, ApprovalStep, AppTool, AttendanceRecord, AuditLogEntry, BesModule,
  CalendarEvent, ChatConversation, ChatMessage, Comment, DepartmentId, EmailFolder, EmailMessage,
  GmKpiData, NewsPost, NewsReadState, OrgChart, Payslip, PolicyDocument, QmsDocument,
  ProcessType, StorageItem, StorageQuota, StrategicProject, SupportTicket, WorkItem, WorkStatus,
} from '@/lib/types';

function seedAll() {
  resetRefCounter();
  const workItems = buildWorkItems();
  const news = buildNewsPosts();
  return {
    events: buildCalendarEvents(),
    news,
    newsReadStates: buildNewsReadStates(news),
    attendance: buildAttendance(),
    payslips: buildPayslips(),
    workItems,
    documents: buildDocuments(),
    projects: buildProjects(),
    notifications: buildNotifications(workItems, news),
    modules: buildModules(),
    auditLog: buildAuditLog(),
    supportTickets: buildSupportTickets(),
    emails: buildEmails(),
    conversations: buildConversations(),
    chatMessages: buildChatMessages(),
    tools: buildTools(),
    storageItems: buildStorageItems(CURRENT_EMPLOYEE.id),
    storageQuotas: buildStorageQuotas(EMPLOYEES),
    qmsDocuments: buildQmsDocuments(),
    gmKpi: buildGmKpiData(),
    orgCharts: ORG_CHARTS,
    enterpriseOrgChart: ENTERPRISE_ORG_CHART,
    clock: { clockedIn: false, lastClockIn: null as string | null },
  };
}

type SeedState = ReturnType<typeof seedAll>;

interface DataContextValue {
  employees: typeof EMPLOYEES;
  departments: typeof DEPARTMENTS;
  events: CalendarEvent[];
  news: NewsPost[];
  newsReadStates: NewsReadState[];
  attendance: AttendanceRecord[];
  payslips: Payslip[];
  workItems: WorkItem[];
  documents: PolicyDocument[];
  projects: StrategicProject[];
  notifications: import('@/lib/types').AppNotification[];
  modules: BesModule[];
  auditLog: AuditLogEntry[];
  supportTickets: SupportTicket[];
  emails: EmailMessage[];
  conversations: ChatConversation[];
  chatMessages: ChatMessage[];
  tools: AppTool[];
  storageItems: StorageItem[];
  storageQuotas: StorageQuota[];
  qmsDocuments: QmsDocument[];
  gmKpi: GmKpiData;
  orgCharts: Record<DepartmentId, OrgChart>;
  enterpriseOrgChart: OrgChart;
  clockedIn: boolean;

  // Calendar
  addPersonalEvent: (e: Omit<CalendarEvent, 'id' | 'editable' | 'ownerId'>) => void;
  updatePersonalEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  deletePersonalEvent: (id: string) => void;
  toggleEventDone: (id: string, done: boolean) => void;
  createTaskFromCalendarEvent: (task: CalendarTaskInput) => Promise<{ ok: true; task: WorkItem } | { ok: false; error: string }>;

  // News
  markNewsRead: (postId: string) => void;
  toggleBookmark: (postId: string) => void;
  acknowledgeNews: (postId: string) => void;
  publishNews: (post: Omit<NewsPost, 'id'>) => void;
  updateNews: (id: string, patch: Partial<NewsPost>) => void;

  // Work items
  submitWorkItem: (item: Omit<WorkItem, 'id' | 'activity' | 'comments' | 'approvalChain'> & { approvalChain?: ApprovalStep[] }, refPrefix: string) => WorkItem;
  saveDraft: (item: Omit<WorkItem, 'id' | 'activity' | 'comments' | 'approvalChain'>, refPrefix: string, existingId?: string) => WorkItem;
  updateWorkItem: (id: string, patch: Partial<WorkItem>) => void;
  approveStep: (workItemId: string, stepId: string, actorName: string) => void;
  returnStep: (workItemId: string, stepId: string, actorName: string, remarks: string) => void;
  rejectStep: (workItemId: string, stepId: string, actorName: string, remarks: string) => void;
  reassignStep: (workItemId: string, stepId: string, newApprover: string) => void;
  addComment: (workItemId: string, author: string, message: string, authorId?: string, parentCommentId?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  editComment: (workItemId: string, commentId: string, message: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  deleteComment: (workItemId: string, commentId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  cancelWorkItem: (id: string, actorName: string) => void;

  // Attendance
  clockIn: () => void;
  clockOut: () => void;

  // Modules
  addModule: (m: Omit<BesModule, 'id'>) => void;
  updateModule: (id: string, patch: Partial<BesModule>) => void;

  // Tools (department application-portal access)
  updateTool: (code: string, patch: Partial<AppTool>) => void;
  setToolAccess: (code: string, access: AppTool['access']) => void;

  // ISO / QMS
  updateQmsFlowchart: (docId: string, flowchart: QmsDocument['flowchart']) => void;

  // Organizational charts
  updateDepartmentOrgChart: (deptId: DepartmentId, chart: OrgChart) => void;
  updateEnterpriseOrgChart: (chart: OrgChart) => void;

  // Personal file storage
  createFolder: (name: string, parentId: string | null, ownerId: string) => void;
  uploadFile: (name: string, sizeBytes: number, parentId: string | null, ownerId: string, mimeType?: string) => { ok: true } | { ok: false; error: string };
  renameStorageItem: (id: string, name: string) => void;
  deleteStorageItem: (id: string) => void;
  setUserStorageQuota: (employeeId: string, quotaBytes: number) => void;
  storageUsedBytes: (ownerId: string) => number;
  storageQuotaBytes: (ownerId: string) => number;

  // Notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Support
  addSupportTicket: (t: Omit<SupportTicket, 'id' | 'status' | 'dateSubmitted'>) => void;

  // Mail
  sendEmail: (toNames: string[], ccNames: string[], subject: string, body: string, attachments: string[]) => EmailMessage;
  saveEmailDraft: (draft: { id?: string; toNames: string[]; ccNames: string[]; subject: string; body: string }) => EmailMessage;
  replyToEmail: (originalId: string, body: string) => EmailMessage;
  markEmailRead: (id: string) => void;
  toggleEmailStar: (id: string) => void;
  moveEmailToFolder: (id: string, folder: EmailFolder) => void;
  permanentlyDeleteEmail: (id: string) => void;

  // Messaging
  sendChatMessage: (conversationId: string, body: string) => void;
  markConversationRead: (conversationId: string) => void;
  startConversation: (participantId: string, participantName: string) => ChatConversation;

  // Audit
  logAction: (actor: string, action: string, target: string, category: AuditLogEntry['category']) => void;

  // Reset
  resetDemoData: () => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function useSeeded<K extends keyof SeedState>(key: K, seed: SeedState) {
  const [value, setValue] = useState<SeedState[K]>(() => loadState(key, () => seed[key]));
  useEffect(() => saveState(key, value), [key, value]);
  return [value, setValue] as const;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  // Bump this key whenever seedAll()'s shape changes, so browsers with an
  // older cached seed (missing newly added collections) regenerate cleanly
  // instead of crashing on undefined fields.
  const seed = loadState('seed-marker-v10', seedAll);

  const [events, setEvents] = useSeeded('events', seed);
  const [news, setNews] = useSeeded('news', seed);
  const [newsReadStates, setNewsReadStates] = useSeeded('newsReadStates', seed);
  const [attendance, setAttendance] = useSeeded('attendance', seed);
  const [payslips] = useSeeded('payslips', seed);
  const [workItems, setWorkItems] = useSeeded('workItems', seed);
  const [documents] = useSeeded('documents', seed);
  const [projects] = useSeeded('projects', seed);
  const [notifications, setNotifications] = useSeeded('notifications', seed);
  const [modules, setModules] = useSeeded('modules', seed);
  const [tools, setTools] = useState<AppTool[]>(() => buildTools());
  const [storageItems, setStorageItems] = useSeeded('storageItems', seed);
  const [storageQuotas, setStorageQuotas] = useSeeded('storageQuotas', seed);
  const [qmsDocuments, setQmsDocuments] = useSeeded('qmsDocuments', seed);
  const [gmKpi] = useSeeded('gmKpi', seed);
  const [orgCharts, setOrgCharts] = useSeeded('orgCharts', seed);
  const [enterpriseOrgChart, setEnterpriseOrgChart] = useSeeded('enterpriseOrgChart', seed);
  const [auditLog, setAuditLog] = useSeeded('auditLog', seed);
  const [supportTickets, setSupportTickets] = useSeeded('supportTickets', seed);
  const [emails, setEmails] = useSeeded('emails', seed);
  const [conversations, setConversations] = useSeeded('conversations', seed);
  const [chatMessages, setChatMessages] = useSeeded('chatMessages', seed);
  const [clock, setClock] = useSeeded('clock', seed);

  // Preserve configured access on existing tools while making newly seeded
  // department tools available to browsers with older persisted data.
  useEffect(() => {
    setTools((current) => {
      const defaults = buildTools();
      const defaultByCode = new Map(defaults.map((tool) => [tool.code, tool]));
      let changed = current.some((tool) => tool.code === 'HR Office');
      const enriched = current.filter((tool) => tool.code !== 'HR Office').map((tool) => {
        const renamedTool = tool.code === 'Motorpool' ? {
          ...tool,
          code: 'General Services Office',
          name: 'General Services Office System',
          description: 'General services, vehicle dispatch, maintenance, and facilities support.',
        } : tool;
        const toolWithRenamedOffices = {
          ...renamedTool,
          access: renamedTool.access.map((grant) => grant.unit === 'Motorpool' ? { ...grant, unit: 'General Services Office' } : grant),
        };
        const seededTool = defaultByCode.get(toolWithRenamedOffices.code);
        if (!toolWithRenamedOffices.status) {
          changed = true;
          toolWithRenamedOffices.status = seededTool?.status ?? 'ENABLED';
        }
        if (toolWithRenamedOffices.taskSubjects === undefined && seededTool?.taskSubjects) {
          changed = true;
          return { ...toolWithRenamedOffices, taskSubjects: seededTool.taskSubjects };
        }
        if (toolWithRenamedOffices !== tool) changed = true;
        return toolWithRenamedOffices;
      });
      const uniqueTools = enriched.filter((tool, index, allTools) => allTools.findIndex((candidate) => candidate.code === tool.code) === index);
      if (uniqueTools.length !== enriched.length) changed = true;
      const existingCodes = new Set(uniqueTools.map((tool) => tool.code));
      const missingTools = defaults.filter((tool) => !existingCodes.has(tool.code));
      return changed || missingTools.length > 0 ? [...uniqueTools, ...missingTools] : current;
    });
  }, [setTools]);

  useEffect(() => {
    let cancelled = false;
    fetchCalendarEvents(token)
      .then((oracleEvents) => {
        if (!cancelled) setEvents(oracleEvents);
      })
      .catch((error) => {
        console.warn('Unable to load Oracle calendar events; keeping local seeded events.', error);
      });
    return () => { cancelled = true; };
  }, [setEvents, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const refreshToolsFromOracle = () => fetchToolRegistry(token)
      .then((oracleTools) => {
        if (cancelled) return;
        const oracleByCode = new Map(oracleTools.map((tool) => [tool.code, tool]));
        setTools(buildTools().map((tool) => {
          const configured = oracleByCode.get(tool.code);
          return configured ? { ...tool, ...configured } : tool;
        }));
      })
      .catch((error) => console.warn('Unable to load Oracle tool access; keeping the local fallback.', error));
    void refreshToolsFromOracle();
    const interval = window.setInterval(refreshToolsFromOracle, 10_000);
    window.addEventListener('focus', refreshToolsFromOracle);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshToolsFromOracle);
    };
  }, [setTools, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchWorkTasks(token)
      .then((tasks) => {
        if (cancelled) return;
        setWorkItems((current) => {
          const currentById = new Map(current.map((item) => [item.id, item]));
          const mergedTasks = tasks.map((task) => {
            const existing = currentById.get(task.id);
            if (!existing) return task;
            return {
              ...task,
              comments: existing.comments.length ? existing.comments : task.comments,
              activity: existing.activity.length > task.activity.length ? existing.activity : task.activity,
            };
          });
          // Oracle is authoritative for task assignments. Keeping task rows that
          // are absent from this scoped response can leak stale tasks from a
          // previous login or role preview into the current user's queue.
          return [...mergedTasks, ...current.filter((item) => item.processType !== 'task-assignment')];
        });
      })
      .catch((error) => {
        console.warn('Unable to load Oracle work tasks.', error);
      });
    return () => { cancelled = true; };
  }, [setWorkItems, token]);

  function logAction(actor: string, action: string, target: string, category: AuditLogEntry['category']) {
    setAuditLog((prev) => [
      { id: `LOG-${String(prev.length + 1).padStart(4, '0')}`, timestamp: new Date().toISOString(), actor, action, target, category, ipAddress: '10.20.4.101' },
      ...prev,
    ]);
  }

  // --- Calendar ---
  async function addPersonalEvent(e: Omit<CalendarEvent, 'id' | 'editable' | 'ownerId'>) {
    const newEvent: CalendarEvent = { ...e, id: `EVT-P-${Date.now()}`, editable: true, color: e.color ?? '#475569', ownerId: user?.username ?? CURRENT_EMPLOYEE.id };
    setEvents((prev) => [...prev, newEvent]);
    logAction(CURRENT_EMPLOYEE.name, 'Created personal calendar event', newEvent.title, 'Data Change');
    if (!token) return;
    try {
      const saved = await createCalendarEvent(token, e);
      setEvents((prev) => prev.map((ev) => (ev.id === newEvent.id ? saved.event : ev)));
    } catch (error) {
      console.warn('Unable to save personal calendar event to Oracle.', error);
    }
  }
  async function updatePersonalEvent(id: string, patch: Partial<CalendarEvent>) {
    const current = events.find((ev) => ev.id === id);
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
    if (!token || !current) return;
    try {
      await updateCalendarEvent(token, id, { ...current, ...patch });
    } catch (error) {
      console.warn('Unable to update personal calendar event in Oracle.', error);
    }
  }
  async function toggleEventDone(id: string, done: boolean) {
    const doneAt = done ? new Date().toISOString() : null;
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, done, doneAt, doneBy: done ? user?.username ?? 'current-user' : null } : ev)));
    if (!token) return;
    try {
      await setCalendarEventDone(token, id, done);
    } catch (error) {
      console.warn('Unable to update calendar done status in Oracle.', error);
    }
  }
  async function deletePersonalEvent(id: string) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (!token) return;
    try {
      await deleteOracleCalendarEvent(token, id);
    } catch (error) {
      console.warn('Unable to delete personal calendar event in Oracle.', error);
    }
  }

  async function createTaskFromCalendarEvent(task: CalendarTaskInput): Promise<{ ok: true; task: WorkItem } | { ok: false; error: string }> {
    if (!token) return { ok: false, error: 'You must be signed in to create a task.' };
    try {
      const saved = await createCalendarTask(token, task);
      setWorkItems((prev) => [saved.task, ...prev.filter((item) => item.id !== saved.task.id)]);
      logAction(user?.name ?? CURRENT_EMPLOYEE.name, task.calendarEventId ? 'Created task from calendar event' : 'Created task', saved.task.title, 'Data Change');
      return { ok: true, task: saved.task };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to create task.' };
    }
  }

  // --- News ---
  function ensureReadState(postId: string, prev: NewsReadState[]): NewsReadState[] {
    if (prev.some((r) => r.postId === postId)) return prev;
    return [...prev, { postId, read: false, bookmarked: false, acknowledged: false }];
  }
  function markNewsRead(postId: string) {
    setNewsReadStates((prev) => ensureReadState(postId, prev).map((r) => (r.postId === postId ? { ...r, read: true } : r)));
  }
  function toggleBookmark(postId: string) {
    setNewsReadStates((prev) => ensureReadState(postId, prev).map((r) => (r.postId === postId ? { ...r, bookmarked: !r.bookmarked } : r)));
  }
  function acknowledgeNews(postId: string) {
    setNewsReadStates((prev) => ensureReadState(postId, prev).map((r) => (r.postId === postId ? { ...r, read: true, acknowledged: true, acknowledgedAt: new Date().toISOString() } : r)));
    logAction(CURRENT_EMPLOYEE.name, 'Acknowledged memo', postId, 'Workflow');
  }
  function publishNews(post: Omit<NewsPost, 'id'>) {
    const id = `NWS-${String(news.length + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
    setNews((prev) => [{ ...post, id }, ...prev]);
    logAction('admin', 'Published post', id, 'Administration');
  }
  function updateNews(id: string, patch: Partial<NewsPost>) {
    setNews((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  // --- Work items ---
  function buildActivity(action: string, actor: string, detail?: string): ActivityEntry {
    return { id: `ACT-${Date.now()}-${Math.round(Math.random() * 1e5)}`, timestamp: new Date().toISOString(), actor, action, detail };
  }

  function submitWorkItem(item: Omit<WorkItem, 'id' | 'activity' | 'comments' | 'approvalChain'> & { approvalChain?: ApprovalStep[] }, refPrefix: string): WorkItem {
    const id = randomRef(refPrefix);
    const newItem: WorkItem = {
      ...item,
      id,
      dateSubmitted: item.dateSubmitted || new Date().toISOString().slice(0, 10),
      status: item.status === 'Draft' ? 'Draft' : 'Submitted',
      approvalChain: item.approvalChain ?? [],
      comments: [],
      activity: [buildActivity('Submitted request', item.requestorName)],
    };
    setWorkItems((prev) => [newItem, ...prev]);
    logAction(item.requestorName, 'Submitted request', id, 'Workflow');
    return newItem;
  }

  function saveDraft(item: Omit<WorkItem, 'id' | 'activity' | 'comments' | 'approvalChain'>, refPrefix: string, existingId?: string): WorkItem {
    if (existingId) {
      let updated: WorkItem | undefined;
      setWorkItems((prev) => prev.map((w) => {
        if (w.id !== existingId) return w;
        updated = { ...w, ...item, status: 'Draft', activity: [...w.activity, buildActivity('Draft updated', item.requestorName)] };
        return updated;
      }));
      return updated ?? (workItems.find((w) => w.id === existingId) as WorkItem);
    }
    const id = randomRef(refPrefix);
    const newItem: WorkItem = { ...item, id, status: 'Draft', dateSubmitted: '', approvalChain: [], comments: [], activity: [buildActivity('Draft created', item.requestorName)] };
    setWorkItems((prev) => [newItem, ...prev]);
    return newItem;
  }

  function updateWorkItem(id: string, patch: Partial<WorkItem>) {
    setWorkItems((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  function nextPendingIndex(chain: ApprovalStep[]) {
    return chain.findIndex((s) => s.status === 'Pending');
  }

  function approveStep(workItemId: string, stepId: string, actorName: string) {
    setWorkItems((prev) => prev.map((w) => {
      if (w.id !== workItemId) return w;
      const chain = w.approvalChain.map((s) => (s.id === stepId ? { ...s, status: 'Approved' as const, actedAt: new Date().toISOString() } : s));
      const stillPending = nextPendingIndex(chain) !== -1;
      const allApproved = chain.every((s) => s.status === 'Approved' || s.status === 'Skipped');
      const newStatus: WorkStatus = allApproved ? 'Approved' : stillPending ? 'Pending Approval' : 'Approved';
      return { ...w, approvalChain: chain, status: newStatus, activity: [...w.activity, buildActivity('Approved', actorName)] };
    }));
    logAction(actorName, 'Approved request', workItemId, 'Workflow');
  }

  function returnStep(workItemId: string, stepId: string, actorName: string, remarks: string) {
    setWorkItems((prev) => prev.map((w) => {
      if (w.id !== workItemId) return w;
      const chain = w.approvalChain.map((s) => (s.id === stepId ? { ...s, status: 'Returned' as const, actedAt: new Date().toISOString(), remarks } : s));
      const comment: Comment = { id: `C-${Date.now()}`, author: actorName, timestamp: new Date().toISOString(), message: remarks };
      return { ...w, approvalChain: chain, status: 'Returned', comments: [...w.comments, comment], activity: [...w.activity, buildActivity('Returned for revision', actorName, remarks)] };
    }));
    logAction(actorName, 'Returned request for revision', workItemId, 'Workflow');
  }

  function rejectStep(workItemId: string, stepId: string, actorName: string, remarks: string) {
    setWorkItems((prev) => prev.map((w) => {
      if (w.id !== workItemId) return w;
      const chain = w.approvalChain.map((s) => (s.id === stepId ? { ...s, status: 'Rejected' as const, actedAt: new Date().toISOString(), remarks } : s));
      const comment: Comment = { id: `C-${Date.now()}`, author: actorName, timestamp: new Date().toISOString(), message: remarks };
      return { ...w, approvalChain: chain, status: 'Rejected', comments: [...w.comments, comment], activity: [...w.activity, buildActivity('Rejected', actorName, remarks)] };
    }));
    logAction(actorName, 'Rejected request', workItemId, 'Workflow');
  }

  function reassignStep(workItemId: string, stepId: string, newApprover: string) {
    setWorkItems((prev) => prev.map((w) => {
      if (w.id !== workItemId) return w;
      const chain = w.approvalChain.map((s) => (s.id === stepId ? { ...s, approverName: newApprover } : s));
      return { ...w, approvalChain: chain, activity: [...w.activity, buildActivity('Reassigned approval step', CURRENT_EMPLOYEE.name, `Reassigned to ${newApprover}`)] };
    }));
  }

  function addNestedComment(comments: Comment[], parentCommentId: string, comment: Comment): Comment[] {
    return comments.map((existing) => {
      if (existing.id === parentCommentId) return { ...existing, replies: [...(existing.replies ?? []), comment] };
      return { ...existing, replies: existing.replies ? addNestedComment(existing.replies, parentCommentId, comment) : existing.replies };
    });
  }

  function markNestedCommentDeleted(comments: Comment[], commentId: string): Comment[] {
    return comments.map((existing) => {
      if (existing.id === commentId) return { ...existing, deleted: true, message: 'This comment was deleted.' };
      return { ...existing, replies: existing.replies ? markNestedCommentDeleted(existing.replies, commentId) : existing.replies };
    });
  }

  function replaceNestedComment(comments: Comment[], commentId: string, patch: Partial<Comment>): Comment[] {
    return comments.map((existing) => {
      if (existing.id === commentId) return { ...existing, ...patch };
      return { ...existing, replies: existing.replies ? replaceNestedComment(existing.replies, commentId, patch) : existing.replies };
    });
  }

  async function addComment(workItemId: string, author: string, message: string, authorId?: string, parentCommentId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
    let comment: Comment;
    if (token && workItemId.startsWith('TASK-')) {
      try {
        const saved = await createWorkComment(token, workItemId, message, parentCommentId);
        comment = saved.comment;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unable to save comment.' };
      }
    } else {
      comment = { id: `C-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, author, authorId, timestamp: new Date().toISOString(), message, replies: [] };
    }
    setWorkItems((prev) => prev.map((w) => {
      if (w.id !== workItemId) return w;
      const comments = parentCommentId ? addNestedComment(w.comments, parentCommentId, comment) : [...w.comments, comment];
      return { ...w, comments, activity: [...w.activity, buildActivity(parentCommentId ? 'Added reply' : 'Added comment', author, message)] };
    }));
    return { ok: true };
  }

  async function editComment(workItemId: string, commentId: string, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
    let updated: Partial<Comment> = { message };
    if (token && workItemId.startsWith('TASK-')) {
      try {
        const saved = await updateWorkComment(token, workItemId, commentId, message);
        updated = saved.comment;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unable to update comment.' };
      }
    }
    setWorkItems((prev) => prev.map((w) => (w.id === workItemId ? { ...w, comments: replaceNestedComment(w.comments, commentId, updated) } : w)));
    return { ok: true };
  }

  async function deleteComment(workItemId: string, commentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (token && workItemId.startsWith('TASK-')) {
      try {
        await deleteWorkComment(token, workItemId, commentId);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Unable to delete comment.' };
      }
    }
    setWorkItems((prev) => prev.map((w) => (w.id === workItemId ? { ...w, comments: markNestedCommentDeleted(w.comments, commentId) } : w)));
    return { ok: true };
  }

  function cancelWorkItem(id: string, actorName: string) {
    setWorkItems((prev) => prev.map((w) => (w.id === id ? { ...w, status: 'Cancelled', activity: [...w.activity, buildActivity('Cancelled', actorName)] } : w)));
  }

  // --- Attendance ---
  function clockIn() {
    setClock({ clockedIn: true, lastClockIn: new Date().toISOString() });
    const today = new Date().toISOString().slice(0, 10);
    setAttendance((prev) => {
      const exists = prev.find((a) => a.date === today);
      if (exists) return prev.map((a) => (a.date === today ? { ...a, timeIn: new Date().toTimeString().slice(0, 5), status: 'Present' } : a));
      return [...prev, { id: `ATT-${today}`, date: today, timeIn: new Date().toTimeString().slice(0, 5), status: 'Present' }];
    });
  }
  function clockOut() {
    setClock({ clockedIn: false, lastClockIn: clock.lastClockIn });
    const today = new Date().toISOString().slice(0, 10);
    setAttendance((prev) => prev.map((a) => (a.date === today ? { ...a, timeOut: new Date().toTimeString().slice(0, 5), hoursRendered: 8 } : a)));
  }

  // --- Modules ---
  function addModule(m: Omit<BesModule, 'id'>) {
    const id = `MOD-${String(modules.length + 1).padStart(3, '0')}`;
    setModules((prev) => [...prev, { ...m, id }]);
    logAction('admin', 'Added BES module proposal', id, 'Administration');
  }
  function updateModule(id: string, patch: Partial<BesModule>) {
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  // --- Tools ---
  function updateTool(code: string, patch: Partial<AppTool>) {
    setTools((prev) => prev.map((t) => (t.code === code ? { ...t, ...patch } : t)));
  }
  function setToolAccess(code: string, access: AppTool['access']) {
    setTools((prev) => prev.map((t) => (t.code === code ? { ...t, access } : t)));
    logAction('admin', 'Updated tool access', code, 'Administration');
  }

  // --- ISO / QMS ---
  function updateQmsFlowchart(docId: string, flowchart: QmsDocument['flowchart']) {
    setQmsDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, flowchart } : d)));
    logAction(CURRENT_EMPLOYEE.name, 'Updated procedure flowchart', docId, 'Data Change');
  }

  // --- Organizational charts ---
  function updateDepartmentOrgChart(deptId: DepartmentId, chart: OrgChart) {
    setOrgCharts((prev) => ({ ...prev, [deptId]: chart }));
    logAction(CURRENT_EMPLOYEE.name, 'Updated department organizational chart', deptId, 'Data Change');
  }
  function updateEnterpriseOrgChart(chart: OrgChart) {
    setEnterpriseOrgChart(chart);
    logAction(CURRENT_EMPLOYEE.name, 'Updated enterprise organizational chart', 'Organization', 'Data Change');
  }

  // --- Personal file storage ---
  function storageQuotaBytes(ownerId: string): number {
    return storageQuotas.find((q) => q.employeeId === ownerId)?.quotaBytes ?? DEFAULT_STORAGE_QUOTA_BYTES;
  }
  function storageUsedBytes(ownerId: string): number {
    return storageItems.filter((i) => i.ownerId === ownerId && i.type === 'file').reduce((sum, i) => sum + i.sizeBytes, 0);
  }
  function createFolder(name: string, parentId: string | null, ownerId: string) {
    const now = new Date().toISOString();
    const item: StorageItem = { id: `FS-${Date.now()}`, name, type: 'folder', parentId, ownerId, sizeBytes: 0, createdAt: now, modifiedAt: now };
    setStorageItems((prev) => [...prev, item]);
    logAction(CURRENT_EMPLOYEE.name, 'Created folder', name, 'Data Change');
  }
  function uploadFile(name: string, sizeBytes: number, parentId: string | null, ownerId: string, mimeType?: string): { ok: true } | { ok: false; error: string } {
    if (storageUsedBytes(ownerId) + sizeBytes > storageQuotaBytes(ownerId)) {
      return { ok: false, error: 'This file would exceed your storage quota.' };
    }
    const now = new Date().toISOString();
    const item: StorageItem = { id: `FS-${Date.now()}`, name, type: 'file', parentId, ownerId, sizeBytes, mimeType, createdAt: now, modifiedAt: now };
    setStorageItems((prev) => [...prev, item]);
    logAction(CURRENT_EMPLOYEE.name, 'Uploaded file', name, 'Data Change');
    return { ok: true };
  }
  function renameStorageItem(id: string, name: string) {
    setStorageItems((prev) => prev.map((i) => (i.id === id ? { ...i, name, modifiedAt: new Date().toISOString() } : i)));
  }
  function deleteStorageItem(id: string) {
    setStorageItems((prev) => {
      const toDelete = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of prev) {
          if (item.parentId && toDelete.has(item.parentId) && !toDelete.has(item.id)) {
            toDelete.add(item.id);
            changed = true;
          }
        }
      }
      return prev.filter((i) => !toDelete.has(i.id));
    });
    logAction(CURRENT_EMPLOYEE.name, 'Deleted storage item', id, 'Data Change');
  }
  function setUserStorageQuota(employeeId: string, quotaBytes: number) {
    setStorageQuotas((prev) => (
      prev.some((q) => q.employeeId === employeeId)
        ? prev.map((q) => (q.employeeId === employeeId ? { ...q, quotaBytes } : q))
        : [...prev, { employeeId, quotaBytes }]
    ));
    logAction('admin', 'Updated storage quota', employeeId, 'Administration');
  }

  // --- Notifications ---
  function markNotificationRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }
  function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  // --- Support ---
  function addSupportTicket(t: Omit<SupportTicket, 'id' | 'status' | 'dateSubmitted'>) {
    const id = `TCK-${new Date().getFullYear()}-${String(supportTickets.length + 1).padStart(5, '0')}`;
    setSupportTickets((prev) => [{ ...t, id, status: 'Open', dateSubmitted: new Date().toISOString().slice(0, 10) }, ...prev]);
    logAction(t.submittedBy, `Submitted ${t.type.toLowerCase()}`, id, 'Data Change');
  }

  // --- Mail ---
  function sendEmail(toNames: string[], ccNames: string[], subject: string, body: string, attachments: string[]): EmailMessage {
    const id = `MAIL-${Date.now()}`;
    const newEmail: EmailMessage = {
      id, threadId: id, fromId: CURRENT_EMPLOYEE.id, fromName: CURRENT_EMPLOYEE.name,
      toNames, ccNames, subject, body, timestamp: new Date().toISOString(),
      read: true, starred: false, folder: 'sent', attachments,
    };
    setEmails((prev) => [newEmail, ...prev]);
    logAction(CURRENT_EMPLOYEE.name, 'Sent email', subject, 'Data Change');
    return newEmail;
  }

  function saveEmailDraft(draft: { id?: string; toNames: string[]; ccNames: string[]; subject: string; body: string }): EmailMessage {
    if (draft.id) {
      let updated: EmailMessage | undefined;
      setEmails((prev) => prev.map((m) => {
        if (m.id !== draft.id) return m;
        updated = { ...m, toNames: draft.toNames, ccNames: draft.ccNames, subject: draft.subject, body: draft.body, timestamp: new Date().toISOString() };
        return updated;
      }));
      return updated ?? (emails.find((m) => m.id === draft.id) as EmailMessage);
    }
    const id = `MAIL-${Date.now()}`;
    const newEmail: EmailMessage = {
      id, threadId: id, fromId: CURRENT_EMPLOYEE.id, fromName: CURRENT_EMPLOYEE.name,
      toNames: draft.toNames, ccNames: draft.ccNames, subject: draft.subject, body: draft.body,
      timestamp: new Date().toISOString(), read: true, starred: false, folder: 'drafts', attachments: [],
    };
    setEmails((prev) => [newEmail, ...prev]);
    return newEmail;
  }

  function replyToEmail(originalId: string, body: string): EmailMessage {
    const original = emails.find((m) => m.id === originalId);
    const id = `MAIL-${Date.now()}`;
    const newEmail: EmailMessage = {
      id, threadId: original?.threadId ?? originalId, fromId: CURRENT_EMPLOYEE.id, fromName: CURRENT_EMPLOYEE.name,
      toNames: original ? [original.fromName] : [], ccNames: [],
      subject: original ? (original.subject.startsWith('RE:') ? original.subject : `RE: ${original.subject}`) : 'RE:',
      body, timestamp: new Date().toISOString(), read: true, starred: false, folder: 'sent', attachments: [], inReplyTo: originalId,
    };
    setEmails((prev) => [newEmail, ...prev]);
    logAction(CURRENT_EMPLOYEE.name, 'Replied to email', newEmail.subject, 'Data Change');
    return newEmail;
  }

  function markEmailRead(id: string) {
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, read: true } : m)));
  }
  function toggleEmailStar(id: string) {
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)));
  }
  function moveEmailToFolder(id: string, folder: EmailFolder) {
    setEmails((prev) => prev.map((m) => (m.id === id ? { ...m, folder } : m)));
  }
  function permanentlyDeleteEmail(id: string) {
    setEmails((prev) => prev.filter((m) => m.id !== id));
  }

  // --- Messaging ---
  function sendChatMessage(conversationId: string, body: string) {
    const msg: ChatMessage = {
      id: `CM-${Date.now()}`, conversationId, senderId: CURRENT_EMPLOYEE.id, senderName: CURRENT_EMPLOYEE.name,
      body, timestamp: new Date().toISOString(), read: true,
    };
    setChatMessages((prev) => [...prev, msg]);
  }
  function markConversationRead(conversationId: string) {
    setChatMessages((prev) => prev.map((m) => (m.conversationId === conversationId ? { ...m, read: true } : m)));
  }
  function startConversation(participantId: string, participantName: string): ChatConversation {
    const existing = conversations.find((c) => !c.isGroup && c.participantIds.includes(participantId));
    if (existing) return existing;
    const conv: ChatConversation = { id: `CHAT-${Date.now()}`, participantIds: [participantId], participantNames: [participantName], isGroup: false };
    setConversations((prev) => [...prev, conv]);
    return conv;
  }

  // --- Reset ---
  function resetDemoData() {
    clearAllBesData();
    window.location.href = '/login';
  }

  const value: DataContextValue = {
    employees: EMPLOYEES, departments: DEPARTMENTS,
    events, news, newsReadStates, attendance, payslips, workItems, documents,
    projects, notifications, modules, auditLog, supportTickets,
    emails, conversations, chatMessages, tools, storageItems, storageQuotas, qmsDocuments, gmKpi,
    orgCharts, enterpriseOrgChart,
    clockedIn: clock.clockedIn,
    addPersonalEvent, updatePersonalEvent, deletePersonalEvent, toggleEventDone,
    markNewsRead, toggleBookmark, acknowledgeNews, publishNews, updateNews,
    submitWorkItem, saveDraft, updateWorkItem, approveStep, returnStep, rejectStep, reassignStep, addComment, editComment, deleteComment, cancelWorkItem, createTaskFromCalendarEvent,
    clockIn, clockOut,
    addModule, updateModule,
    updateTool, setToolAccess,
    updateQmsFlowchart,
    updateDepartmentOrgChart, updateEnterpriseOrgChart,
    createFolder, uploadFile, renameStorageItem, deleteStorageItem, setUserStorageQuota, storageUsedBytes, storageQuotaBytes,
    markNotificationRead, markAllNotificationsRead,
    addSupportTicket,
    sendEmail, saveEmailDraft, replyToEmail, markEmailRead, toggleEmailStar, moveEmailToFolder, permanentlyDeleteEmail,
    sendChatMessage, markConversationRead, startConversation,
    logAction,
    resetDemoData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

export type { ProcessType };
