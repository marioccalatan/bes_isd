import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Drawer } from '@/components/ui/drawer';
import { Toolbar } from '@/components/shared/Toolbar';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { findModule, type WorkspaceRecord } from '@/lib/workspace';
import { formatDate } from '@/lib/utils';
import Governance from './Governance';
import NotFound from './NotFound';
import PoliciesIssuances from './PoliciesIssuances';
import RecruitmentOnboarding from './RecruitmentOnboarding';
import HumanResources from './HumanResources';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canAccessTool } from '@/lib/toolAccess';

const STATUS_STYLES: Record<WorkspaceRecord['status'], string> = {
  Active: 'border-brand-200 bg-brand-50 text-brand-700',
  Pending: 'border-gold-200 bg-gold-50 text-gold-800',
  Completed: 'border-green-200 bg-green-50 text-green-700',
  Ongoing: 'border-brand-200 bg-brand-50 text-brand-700',
  Scheduled: 'border-slate-200 bg-slate-100 text-slate-600',
};

export default function WorkspaceModule() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const { tools } = useData();
  const { user } = useAuth();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewOffice, previewPosition } = useRolePreview();
  const [selected, setSelected] = useState<WorkspaceRecord | null>(null);
  const mod = findModule(moduleId ?? '');
  const { search, setSearch, pageRows } = useTableControls(mod?.records ?? [], (r, q) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q), 20);

  if (moduleId === 'governance') {
    if (effectiveRole !== 'Administrator') return <NotFound />;
    return (
      <div>
        <PageHeader title="BES Governance and Adoption" description="Oversight of the BES module registry, adoption metrics, and digital readiness across departments." crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: 'BES Governance and Adoption' }]} />
        <Governance />
      </div>
    );
  }

  if (!mod) return <NotFound />;
  const tool = tools.find((item) => item.code === mod.name);
  if (!tool || tool.status !== 'ENABLED' || !canAccessTool(tool, {
    role: effectiveRole,
    departmentCode: previewDepartmentId ?? user?.departmentCode,
    officeName: isPreviewing ? previewOffice : user?.unitName,
    positionTitle: isPreviewing ? previewPosition : user?.position,
  })) return <NotFound />;
  if (moduleId === 'policies-issuances') return <PoliciesIssuances module={mod} />;
  if (moduleId === 'recruitment') return <RecruitmentOnboarding module={mod} />;
  if (moduleId === 'human-resources') return <HumanResources module={mod} taskSubject="Human Resource" />;
  if (moduleId === 'employee-relations') return <HumanResources module={mod} taskSubject="Employee Relations" />;
  if (['learning-development', 'performance-management', 'institutional-communications', 'member-programs', 'records-management', 'events-management'].includes(moduleId ?? '')) {
    return <HumanResources module={mod} taskSubject={mod.name} />;
  }

  const columns: Column<WorkspaceRecord>[] = [
    { key: 'title', header: 'Title', render: (r) => <span className="font-medium text-slate-800">{r.title}</span> },
    { key: 'subtitle', header: 'Detail', render: (r) => r.subtitle },
    { key: 'tag', header: 'Category', render: (r) => <Badge>{r.tag}</Badge> },
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'status', header: 'Status', render: (r) => <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader title={mod.name} description={mod.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: mod.name }]} />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {mod.stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Records</CardTitle></CardHeader>
        <CardContent>
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search records…"
            onExport={() => exportToCsv(`${mod.id}.csv`, ['Title', 'Detail', 'Category', 'Date', 'Status'], mod.records.map((r) => [r.title, r.subtitle, r.tag, r.date, r.status]))}
            onPrint={() => window.print()}
          />
          <DataTable columns={columns} rows={pageRows} getRowId={(r) => r.id} onRowClick={setSelected} cardTitle={(r) => r.title} />
        </CardContent>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''}>
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge>{selected.tag}</Badge>
              <Badge className={STATUS_STYLES[selected.status]}>{selected.status}</Badge>
            </div>
            <p className="text-slate-500">{formatDate(selected.date)}</p>
            <p className="font-medium text-slate-800">{selected.subtitle}</p>
            <p className="text-slate-600">{selected.description}</p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
