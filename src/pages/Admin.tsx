import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, X, Plus, Pencil, Trash2, RotateCcw, ShieldCheck, ArrowRight, LayoutGrid, HardDrive,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Toolbar } from '@/components/shared/Toolbar';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { initials, formatDateTime, formatDate, formatBytes } from '@/lib/utils';
import { PERMISSION_FACTORS, ROLES_FOR_MATRIX, CAPABILITIES, MATRIX, NOTIFICATION_TEMPLATES, REFERENCE_PREFIXES } from '@/lib/adminData';
import { CLASS_STYLES_LIST } from '@/lib/docClassifications';
import { WORKFLOWS } from '@/lib/workflows';
import { PROCESS_DEFS } from '@/lib/processDefs';
import { getToolIcon } from '@/lib/toolIcons';
import Governance from './Governance';
import type { AppTool, AuditLogEntry, DepartmentId, Employee, ToolAccessLevel } from '@/lib/types';

const TABS = [
  { value: 'users', label: 'User Management' },
  { value: 'roles', label: 'Roles & Permissions' },
  { value: 'depts', label: 'Departments & Positions' },
  { value: 'modules', label: 'Module Registry' },
  { value: 'tools', label: 'Tool Access' },
  { value: 'storage', label: 'Storage Quotas' },
  { value: 'workflows', label: 'Workflow Configuration' },
  { value: 'news', label: 'News & Memo Publishing' },
  { value: 'calendar', label: 'Calendar Administration' },
  { value: 'docs', label: 'Document Classifications' },
  { value: 'refnum', label: 'Reference Numbers' },
  { value: 'notif', label: 'Notification Templates' },
  { value: 'audit', label: 'Audit Logs' },
  { value: 'demo', label: 'Demo Data' },
];

const ACCESS_LEVELS: ToolAccessLevel[] = ['ADMIN', 'EDIT', 'VIEW', 'OPEN', 'NEW', 'SOON', 'EXISTING'];

const LEVEL_BADGE_STYLES: Record<ToolAccessLevel, string> = {
  ADMIN: 'border-brand-200 bg-brand-50 text-brand-700',
  EDIT: 'border-gold-200 bg-gold-50 text-gold-800',
  VIEW: 'border-slate-200 bg-slate-100 text-slate-600',
  OPEN: 'border-green-200 bg-green-50 text-green-700',
  NEW: 'border-gold-200 bg-gold-50 text-gold-800',
  SOON: 'border-slate-200 bg-slate-100 text-slate-400',
  EXISTING: 'border-slate-200 bg-slate-100 text-slate-400',
};

function ToolAccessEditor({ tool, departments, onClose }: { tool: AppTool; departments: { id: DepartmentId; shortName: string; name: string }[]; onClose: () => void }) {
  const { setToolAccess } = useData();
  const { toast } = useToast();
  const [grants, setGrants] = useState<Record<DepartmentId, ToolAccessLevel | null>>(() => {
    const map = {} as Record<DepartmentId, ToolAccessLevel | null>;
    departments.forEach((d) => {
      const existing = tool.access.find((a) => a.departmentId === d.id);
      map[d.id] = existing ? existing.level : null;
    });
    return map;
  });

  function toggle(deptId: DepartmentId, checked: boolean) {
    setGrants((prev) => ({ ...prev, [deptId]: checked ? (prev[deptId] ?? 'VIEW') : null }));
  }
  function setLevel(deptId: DepartmentId, level: ToolAccessLevel) {
    setGrants((prev) => ({ ...prev, [deptId]: level }));
  }

  function save() {
    const access = departments
      .filter((d) => grants[d.id] != null)
      .map((d) => ({ departmentId: d.id, level: grants[d.id]! }));
    setToolAccess(tool.code, access);
    toast({ kind: 'success', title: 'Tool access updated', description: `${tool.code} access saved for ${access.length} department${access.length === 1 ? '' : 's'}.` });
    onClose();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{tool.description}</p>
      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {departments.map((d) => {
          const level = grants[d.id];
          return (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox checked={level != null} onChange={(e) => toggle(d.id, e.target.checked)} />
                {d.name}
                {d.id === tool.ownerDepartmentId && <Badge className="border-gold-200 bg-gold-50 text-gold-800">Owner</Badge>}
              </label>
              <Select
                value={level ?? ''}
                disabled={level == null}
                onChange={(e) => setLevel(d.id, e.target.value as ToolAccessLevel)}
                className="w-auto"
                aria-label={`Access level for ${d.name}`}
              >
                {level == null && <option value="">No access</option>}
                {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Access</Button>
      </div>
    </div>
  );
}

function QuotaEditor({ employee, quotaBytes, onClose }: { employee: Employee; quotaBytes: number; onClose: () => void }) {
  const { setUserStorageQuota, storageUsedBytes } = useData();
  const { toast } = useToast();
  const [mb, setMb] = useState(Math.round(quotaBytes / (1024 * 1024)));

  function save() {
    setUserStorageQuota(employee.id, Math.max(0, mb) * 1024 * 1024);
    toast({ kind: 'success', title: 'Storage quota updated', description: `${employee.name} — ${mb.toLocaleString()} MB` });
    onClose();
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="quota-mb">Quota (MB)</Label>
        <Input id="quota-mb" type="number" min={0} value={mb} onChange={(e) => setMb(Number(e.target.value))} />
        <p className="mt-1 text-xs text-slate-500">Current usage: {formatBytes(storageUsedBytes(employee.id))}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Quota</Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { employees, departments, events, news, auditLog, tools, resetDemoData, storageUsedBytes, storageQuotaBytes } = useData();
  const { toast } = useToast();
  const [tab, setTab] = useState('users');
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<typeof NOTIFICATION_TEMPLATES[number] | null>(null);
  const [toolEdit, setToolEdit] = useState<AppTool | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [quotaEdit, setQuotaEdit] = useState<Employee | null>(null);

  const { search: userSearch, setSearch: setUserSearch, pageRows: userRows } = useTableControls(employees, (e, q) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q), 12);
  const { search: auditSearch, setSearch: setAuditSearch, pageRows: auditRows } = useTableControls(auditLog, (a, q) => a.actor.toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || a.target.toLowerCase().includes(q), 15);
  const { search: storageSearch, setSearch: setStorageSearch, pageRows: storageRows } = useTableControls(employees, (e, q) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q), 12);

  const userColumns: Column<Employee>[] = [
    { key: 'name', header: 'Name', render: (e) => (
      <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{initials(e.name)}</span><span className="font-medium text-slate-800">{e.name}</span></span>
    ) },
    { key: 'id', header: 'Employee ID', render: (e) => <span className="font-mono text-xs">{e.id}</span>, hideOnCard: true },
    { key: 'position', header: 'Position', render: (e) => e.position },
    { key: 'departmentId', header: 'Dept.', render: (e) => <Badge>{e.departmentId}</Badge> },
    { key: 'status', header: 'Status', render: (e) => <Badge className={e.status === 'Active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-600'}>{e.status}</Badge> },
    { key: 'roles', header: 'Special Roles', render: (e) => e.roles.length ? e.roles.join(', ') : '—', hideOnCard: true },
  ];

  const auditColumns: Column<AuditLogEntry>[] = [
    { key: 'timestamp', header: 'Timestamp', render: (a) => formatDateTime(a.timestamp) },
    { key: 'actor', header: 'Actor', render: (a) => a.actor },
    { key: 'action', header: 'Action', render: (a) => a.action },
    { key: 'target', header: 'Target', render: (a) => <span className="font-mono text-xs">{a.target}</span>, hideOnCard: true },
    { key: 'category', header: 'Category', render: (a) => <Badge>{a.category}</Badge> },
    { key: 'ipAddress', header: 'IP Address', render: (a) => a.ipAddress, hideOnCard: true },
  ];

  const storageColumns: Column<Employee>[] = [
    { key: 'name', header: 'Employee', render: (e) => (
      <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{initials(e.name)}</span><span className="font-medium text-slate-800">{e.name}</span></span>
    ) },
    { key: 'departmentId', header: 'Dept.', render: (e) => <Badge>{e.departmentId}</Badge> },
    { key: 'used', header: 'Used', render: (e) => formatBytes(storageUsedBytes(e.id)) },
    { key: 'quota', header: 'Quota', render: (e) => formatBytes(storageQuotaBytes(e.id)) },
    { key: 'pct', header: 'Usage', hideOnCard: true, render: (e) => {
      const used = storageUsedBytes(e.id);
      const quota = storageQuotaBytes(e.id);
      const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className={`block h-1.5 rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} /></span>
          <span className="text-xs text-slate-500">{pct}%</span>
        </span>
      );
    } },
    { key: 'actions', header: '', className: 'text-right', render: (e) => (
      <Button variant="ghost" size="sm" onClick={() => setQuotaEdit(e)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
    ) },
  ];

  const orgEvents = events.filter((e) => !e.editable);

  return (
    <div>
      <PageHeader title="Administration" description="Technical administration for BES. Business data access remains governed separately by role and classification." crumbs={[{ label: 'Administration' }]} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'users' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>User Management</CardTitle>
            <Button size="sm" onClick={() => toast({ kind: 'info', title: 'Simulated action', description: 'In production, this creates a new BES account tied to HR records.' })}><Plus className="h-4 w-4" /> Add User</Button>
          </CardHeader>
          <CardContent>
            <Toolbar search={userSearch} onSearchChange={setUserSearch} placeholder="Search users…" onExport={() => exportToCsv('users.csv', ['Name', 'Employee ID', 'Position', 'Department', 'Status'], employees.map((e) => [e.name, e.id, e.position, e.departmentId, e.status]))} />
            <DataTable columns={userColumns} rows={userRows} getRowId={(e) => e.id} onRowClick={(e) => navigate(`/organization/employee/${e.id}`)} cardTitle={(e) => e.name} />
          </CardContent>
        </Card>
      )}

      {tab === 'roles' && (
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5 text-sm text-slate-600">
              <p className="mb-2 font-semibold text-slate-800">Access is determined by a combination of:</p>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_FACTORS.map((f) => <Badge key={f} className="border-brand-200 bg-brand-50 text-brand-700">{f}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Role and Permission Matrix</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Role</th>
                    {CAPABILITIES.map((c) => <th key={c} className="px-2 py-2 text-center font-semibold">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ROLES_FOR_MATRIX.map((role) => (
                    <tr key={role} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{role}</td>
                      {MATRIX[role].map((granted, i) => (
                        <td key={i} className="px-2 py-2 text-center">
                          {granted ? <Check className="mx-auto h-4 w-4 text-green-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'depts' && (
        <Card>
          <CardHeader><CardTitle>Departments and Positions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {departments.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{d.name}</p>
                  <p className="text-xs text-slate-500">{d.units.length} units · {d.employeeCount} employees</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate(`/organization/${d.id}`)}>View <ArrowRight className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-400">Structural changes to departments and positions require formal HR and Board approval outside this prototype.</p>
          </CardContent>
        </Card>
      )}

      {tab === 'modules' && <Governance />}

      {tab === 'tools' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Tool Access</CardTitle>
            <p className="text-xs text-slate-500">Who can access each department application-portal tool (GIS, OMS, WIS, etc.), and at what level.</p>
          </CardHeader>
          <CardContent>
            <Toolbar search={toolSearch} onSearchChange={setToolSearch} placeholder="Search tools…" />
            <div className="space-y-2">
              {tools.filter((t) => !toolSearch.trim() || t.code.toLowerCase().includes(toolSearch.toLowerCase()) || t.name.toLowerCase().includes(toolSearch.toLowerCase())).map((t) => {
                const Icon = getToolIcon(t.iconKey);
                return (
                  <div key={t.code} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4.5 w-4.5" /></span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{t.code} <span className="font-normal text-slate-500">— {t.name}</span></p>
                        <p className="truncate text-xs text-slate-400">{t.description}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Owner: <span className="font-medium text-slate-600">{t.ownerDepartmentId}</span></p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      {t.access.map((a) => (
                        <Badge key={a.departmentId} className={LEVEL_BADGE_STYLES[a.level]}>{a.departmentId}: {a.level}</Badge>
                      ))}
                      {t.access.length === 0 && <span className="text-xs text-slate-400">No departments granted access</span>}
                      <Button variant="ghost" size="sm" onClick={() => setToolEdit(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'storage' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Storage Quotas</CardTitle>
            <p className="text-xs text-slate-500">Maximum personal file-storage space allotted per employee, and current usage.</p>
          </CardHeader>
          <CardContent>
            <Toolbar search={storageSearch} onSearchChange={setStorageSearch} placeholder="Search employees…" />
            <DataTable columns={storageColumns} rows={storageRows} getRowId={(e) => e.id} cardTitle={(e) => e.name} />
          </CardContent>
        </Card>
      )}

      {tab === 'workflows' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Workflow Configuration Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">Read-only preview of configured approval routing. Changes to production workflow configuration require formal process-owner review.</p>
            {WORKFLOWS.map((w) => (
              <div key={w.processType} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-800">{w.name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  {PROCESS_DEFS[w.processType].approvalChain({}).map((s, i, arr) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-medium">{s.stepName}</span>
                      {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'news' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>News and Memo Publishing</CardTitle>
            <Button size="sm" onClick={() => navigate('/news')}>Go to News and Memos <ArrowRight className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="mb-2 text-sm text-slate-500">Create, publish, schedule, and archive posts from the News and Memos module.</p>
            {news.slice(0, 6).map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{n.title}</span>
                <Badge>{n.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'calendar' && (
        <Card>
          <CardHeader><CardTitle>Calendar Administration</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-500">Organizational calendar layers and events. Personal events remain user-managed from the Calendar module.</p>
            <div className="space-y-1.5">
              {orgEvents.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5 text-sm">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} /> {e.title}</span>
                  <Badge>{e.layer}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'docs' && (
        <Card>
          <CardHeader><CardTitle>Document Classification Levels</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {CLASS_STYLES_LIST.map((c) => (
              <div key={c.label} className="rounded-lg border border-slate-100 p-3">
                <Badge className={c.style}>{c.label}</Badge>
                <p className="mt-1.5 text-sm text-slate-600">{c.explanation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'refnum' && (
        <Card>
          <CardHeader><CardTitle>Reference Number Settings</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-500">Format: <code className="rounded bg-slate-100 px-1.5 py-0.5">BES-[PREFIX]-[YEAR]-[SEQUENCE]</code></p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {REFERENCE_PREFIXES.map((r) => (
                <div key={r.prefix} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-sm">
                  <span className="font-mono font-semibold text-brand-700">{r.prefix}</span>
                  <span className="text-slate-600">{r.process}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'notif' && (
        <Card>
          <CardHeader><CardTitle>Notification Templates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {NOTIFICATION_TEMPLATES.map((t) => (
              <div key={t.category} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.category}</p>
                  <p className="text-xs text-slate-500">Title: {t.title}</p>
                  <p className="text-xs text-slate-500">Message: {t.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setTemplateEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <CardHeader><CardTitle>Audit Logs</CardTitle></CardHeader>
          <CardContent>
            <Toolbar search={auditSearch} onSearchChange={setAuditSearch} placeholder="Search audit logs…" onExport={() => exportToCsv('audit-log.csv', ['Timestamp', 'Actor', 'Action', 'Target', 'Category', 'IP Address'], auditLog.map((a) => [a.timestamp, a.actor, a.action, a.target, a.category, a.ipAddress]))} />
            <DataTable columns={auditColumns} rows={auditRows} getRowId={(a) => a.id} cardTitle={(a) => a.action} />
          </CardContent>
        </Card>
      )}

      {tab === 'demo' && (
        <Card>
          <CardHeader><CardTitle>Demo Data Controls</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Clear Created Transactions</p>
                <p className="text-xs text-slate-500">Remove requests, events, and posts created during this session, restoring baseline mock data.</p>
              </div>
              <Button variant="outline" onClick={() => setClearOpen(true)}><RotateCcw className="h-4 w-4" /> Clear Transactions</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
              <div>
                <p className="text-sm font-medium text-red-800">Reset All Demo Data</p>
                <p className="text-xs text-red-600">Permanently restore all default mock records and clear localStorage. You will be returned to the login screen.</p>
              </div>
              <Button variant="destructive" onClick={() => setResetOpen(true)}><Trash2 className="h-4 w-4" /> Reset Demo Data</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={resetOpen} onClose={() => setResetOpen(false)}
        onConfirm={() => { resetDemoData(); }}
        title="Reset All Demo Data" description="This will permanently clear all data created during this session and restore the original mock dataset. This cannot be undone."
        confirmLabel="Reset Everything" destructive
      />
      <ConfirmDialog
        open={clearOpen} onClose={() => setClearOpen(false)}
        onConfirm={() => { resetDemoData(); }}
        title="Clear Created Transactions" description="This will restore baseline mock data, removing transactions created during this demonstration session."
        confirmLabel="Clear Transactions" destructive
      />

      <Dialog open={!!templateEdit} onClose={() => setTemplateEdit(null)} title={`Edit Template — ${templateEdit?.category ?? ''}`} size="md" footer={<Button onClick={() => { toast({ kind: 'success', title: 'Template updated (prototype)' }); setTemplateEdit(null); }}>Save</Button>}>
        {templateEdit && (
          <div className="space-y-3">
            <div><Label>Title</Label><Input defaultValue={templateEdit.title} /></div>
            <div><Label>Message</Label><Textarea defaultValue={templateEdit.message} /></div>
          </div>
        )}
      </Dialog>

      <Dialog open={!!toolEdit} onClose={() => setToolEdit(null)} title={`Edit Access — ${toolEdit?.code ?? ''}`} description={toolEdit?.name} size="md">
        {toolEdit && (
          <ToolAccessEditor
            tool={toolEdit}
            departments={departments.map((d) => ({ id: d.id, shortName: d.shortName, name: d.name }))}
            onClose={() => setToolEdit(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!quotaEdit} onClose={() => setQuotaEdit(null)} title={`Edit Storage Quota — ${quotaEdit?.name ?? ''}`} size="sm">
        {quotaEdit && (
          <QuotaEditor employee={quotaEdit} quotaBytes={storageQuotaBytes(quotaEdit.id)} onClose={() => setQuotaEdit(null)} />
        )}
      </Dialog>
    </div>
  );
}
