import { useState } from 'react';
import { Plus, Pencil, CheckSquare, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Toolbar } from '@/components/shared/Toolbar';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useTableControls } from '@/hooks/useTableControls';
import { formatDate } from '@/lib/utils';
import type { BesModule, DepartmentId, ModuleStatus, Priority } from '@/lib/types';

const STATUS_STYLES: Record<ModuleStatus, string> = {
  Proposed: 'border-slate-200 bg-slate-100 text-slate-600',
  'In Development': 'border-brand-200 bg-brand-50 text-brand-700',
  Active: 'border-green-200 bg-green-50 text-green-700',
  Deferred: 'border-orange-200 bg-orange-50 text-orange-700',
};

const CHECKLIST = [
  'Module aligned with BES information architecture',
  'Data classification and access rules defined',
  'Process owner and technical owner assigned',
  'User training and orientation materials prepared',
  'Feedback channel established for the module',
  'Reviewed against the Data Privacy Manual',
];

function ModuleFormFields({ value, onChange, departments }: { value: Partial<BesModule>; onChange: (v: Partial<BesModule>) => void; departments: { id: DepartmentId; shortName: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label required>Module Name</Label>
        <Input value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} />
      </div>
      <div>
        <Label required>Business Owner</Label>
        <Input value={value.businessOwner ?? ''} onChange={(e) => onChange({ ...value, businessOwner: e.target.value })} />
      </div>
      <div>
        <Label required>Technical Owner</Label>
        <Input value={value.technicalOwner ?? ''} onChange={(e) => onChange({ ...value, technicalOwner: e.target.value })} />
      </div>
      <div>
        <Label>Department</Label>
        <Select value={value.departmentId ?? 'ISD'} onChange={(e) => onChange({ ...value, departmentId: e.target.value as DepartmentId })}>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.shortName}</option>)}
        </Select>
      </div>
      <div>
        <Label>Status</Label>
        <Select value={value.status ?? 'Proposed'} onChange={(e) => onChange({ ...value, status: e.target.value as ModuleStatus })}>
          <option>Proposed</option><option>In Development</option><option>Active</option><option>Deferred</option>
        </Select>
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={value.priority ?? 'Normal'} onChange={(e) => onChange({ ...value, priority: e.target.value as Priority })}>
          <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
        </Select>
      </div>
      <div>
        <Label>Target Release</Label>
        <Input value={value.targetRelease ?? ''} onChange={(e) => onChange({ ...value, targetRelease: e.target.value })} placeholder="e.g. Q4 2026" />
      </div>
      <div className="sm:col-span-2">
        <Label>Description</Label>
        <Textarea value={value.description ?? ''} onChange={(e) => onChange({ ...value, description: e.target.value })} />
      </div>
    </div>
  );
}

export default function Governance() {
  const { modules, departments, supportTickets, addModule, updateModule } = useData();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BesModule | null>(null);
  const [draft, setDraft] = useState<Partial<BesModule>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set(CHECKLIST.slice(0, 3)));

  const { search, setSearch, sortKey, sortDir, toggleSort, pageRows } = useTableControls(modules, (m, q) => m.name.toLowerCase().includes(q) || m.businessOwner.toLowerCase().includes(q), 20);

  const counts: Record<ModuleStatus, number> = { Proposed: 0, 'In Development': 0, Active: 0, Deferred: 0 };
  modules.forEach((m) => { counts[m.status] += 1; });
  const avgAdoption = Math.round(modules.filter((m) => m.status === 'Active').reduce((s, m) => s + m.adoptionRate, 0) / Math.max(1, modules.filter((m) => m.status === 'Active').length));

  const enhancementRequests = supportTickets.filter((t) => t.type === 'Enhancement Request');

  function openNew() {
    setEditing(null);
    setDraft({ status: 'Proposed', priority: 'Normal', departmentId: 'ISD', adoptionRate: 0, lastReviewDate: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  }
  function openEdit(m: BesModule) {
    setEditing(m);
    setDraft(m);
    setFormOpen(true);
  }
  function saveModule() {
    if (!draft.name || !draft.businessOwner || !draft.technicalOwner) {
      toast({ kind: 'error', title: 'Missing required fields', description: 'Module name, business owner, and technical owner are required.' });
      return;
    }
    if (editing) {
      updateModule(editing.id, draft);
      toast({ kind: 'success', title: 'Module updated' });
    } else {
      addModule({
        name: draft.name!, businessOwner: draft.businessOwner!, technicalOwner: draft.technicalOwner!,
        departmentId: (draft.departmentId as DepartmentId) ?? 'ISD', status: (draft.status as ModuleStatus) ?? 'Proposed',
        priority: (draft.priority as Priority) ?? 'Normal', targetRelease: draft.targetRelease ?? 'TBD',
        adoptionRate: 0, lastReviewDate: new Date().toISOString().slice(0, 10), description: draft.description ?? '',
      });
      toast({ kind: 'success', title: 'Module proposal added' });
    }
    setFormOpen(false);
  }

  const columns: Column<BesModule>[] = [
    { key: 'name', header: 'Module Name', render: (m) => <span className="font-medium text-slate-800">{m.name}</span>, sortable: true },
    { key: 'businessOwner', header: 'Business Owner', render: (m) => m.businessOwner },
    { key: 'technicalOwner', header: 'Technical Owner', render: (m) => m.technicalOwner, hideOnCard: true },
    { key: 'departmentId', header: 'Dept.', render: (m) => <Badge>{m.departmentId}</Badge> },
    { key: 'status', header: 'Status', render: (m) => <Badge className={STATUS_STYLES[m.status]}>{m.status}</Badge> },
    { key: 'priority', header: 'Priority', render: (m) => m.priority, hideOnCard: true },
    { key: 'targetRelease', header: 'Target Release', render: (m) => m.targetRelease },
    { key: 'adoptionRate', header: 'Adoption', render: (m) => `${m.adoptionRate}%`, sortable: true },
    { key: 'lastReviewDate', header: 'Last Review', render: (m) => formatDate(m.lastReviewDate), hideOnCard: true },
    { key: 'actions', header: '', render: (m) => <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(m); }}><Pencil className="h-3.5 w-3.5" /></Button>, hideOnCard: true },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="p-4"><p className="text-xs text-slate-500">Proposed</p><p className="mt-1 text-xl font-bold text-slate-700">{counts.Proposed}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">In Development</p><p className="mt-1 text-xl font-bold text-brand-700">{counts['In Development']}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Active</p><p className="mt-1 text-xl font-bold text-green-700">{counts.Active}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Deferred</p><p className="mt-1 text-xl font-bold text-orange-700">{counts.Deferred}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Avg. Adoption (Active)</p><p className="mt-1 text-xl font-bold text-slate-900">{avgAdoption || 0}%</p></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>BES Module Registry</CardTitle>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4" /> Add Module Proposal</Button>
        </CardHeader>
        <CardContent>
          <Toolbar search={search} onSearchChange={setSearch} placeholder="Search modules or owners…" />
          <DataTable columns={columns} rows={pageRows} getRowId={(m) => m.id} onRowClick={openEdit} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cardTitle={(m) => m.name} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Department Digital Readiness</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {departments.map((d) => {
              const deptModules = modules.filter((m) => m.departmentId === d.id);
              const active = deptModules.filter((m) => m.status === 'Active').length;
              const pct = deptModules.length ? Math.round((active / deptModules.length) * 100) : 0;
              return (
                <div key={d.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">{d.shortName}</span>
                    <span className="text-slate-400">{pct}% ready</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Policy and Standards Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {CHECKLIST.map((item) => {
              const isChecked = checked.has(item);
              return (
                <button key={item} onClick={() => setChecked((prev) => { const next = new Set(prev); if (next.has(item)) next.delete(item); else next.add(item); return next; })} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-slate-50">
                  {isChecked ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Square className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                  <span className={isChecked ? 'text-slate-700' : 'text-slate-500'}>{item}</span>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Training and Orientation Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ScheduleRow title="BES Digital Literacy Orientation" date="2026-08-12" audience="All departments" />
            <ScheduleRow title="Employee Self-Service Walkthrough" date="2026-08-19" audience="New hires" />
            <ScheduleRow title="Manager Approval Workflow Training" date="2026-08-26" audience="Supervisors and managers" />
            <ScheduleRow title="Reports and Analytics Dashboard Training" date="2026-09-02" audience="Department managers" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Feedback and Enhancement Requests</CardTitle></CardHeader>
          <CardContent>
            {enhancementRequests.length === 0 ? (
              <p className="text-sm text-slate-400">No enhancement requests submitted yet. Employees can submit these from Help and Support.</p>
            ) : (
              <div className="space-y-2">
                {enhancementRequests.map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-100 p-2.5">
                    <p className="text-sm font-medium text-slate-800">{t.subject}</p>
                    <p className="text-xs text-slate-500">{t.submittedBy} · {formatDate(t.dateSubmitted)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Module' : 'Add Module Proposal'} size="lg"
        footer={<><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button onClick={saveModule}>Save</Button></>}
      >
        <ModuleFormFields value={draft} onChange={setDraft} departments={departments} />
      </Dialog>
    </div>
  );
}

function ScheduleRow({ title, date, audience }: { title: string; date: string; audience: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5">
      <div>
        <p className="font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{audience}</p>
      </div>
      <span className="text-xs font-medium text-brand-600">{formatDate(date)}</span>
    </div>
  );
}
