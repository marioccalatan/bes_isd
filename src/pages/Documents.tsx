import { useNavigate } from 'react-router-dom';
import { Lock, Star } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canAccessDocument } from '@/lib/permissions';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';
import type { PolicyDocument } from '@/lib/types';

const CLASS_STYLES: Record<string, string> = {
  'Public to All Employees': 'border-green-200 bg-green-50 text-green-700',
  'Department Restricted': 'border-brand-200 bg-brand-50 text-brand-700',
  'Management Restricted': 'border-gold-200 bg-gold-50 text-gold-800',
  'Board Restricted': 'border-orange-200 bg-orange-50 text-orange-700',
  Confidential: 'border-red-200 bg-red-50 text-red-700',
};

export default function Documents() {
  const { documents } = useData();
  const { effectiveRole } = useRolePreview();
  const navigate = useNavigate();
  const [category, setCategory] = useState('All');
  const [classification, setClassification] = useState('All');
  const [status, setStatus] = useState('All');

  const categories = Array.from(new Set(documents.map((d) => d.category)));

  const filteredBase = documents.filter((d) => {
    if (category !== 'All' && d.category !== category) return false;
    if (classification !== 'All' && d.classification !== classification) return false;
    if (status !== 'All' && d.status !== status) return false;
    return true;
  });

  const { search, setSearch, sortKey, sortDir, toggleSort, page, setPage, pageCount, pageRows, filteredCount } = useTableControls(
    filteredBase, (d, q) => d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q), 10
  );

  const columns: Column<PolicyDocument>[] = [
    {
      key: 'title', header: 'Title', sortable: true, render: (d) => {
        const accessible = canAccessDocument(d.classification, effectiveRole);
        return (
          <span className="flex items-center gap-1.5 font-medium text-slate-800">
            {!accessible && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" />} {accessible ? d.title : 'Restricted Document'}
          </span>
        );
      },
    },
    { key: 'category', header: 'Category', render: (d) => d.category },
    { key: 'version', header: 'Version', render: (d) => d.version, hideOnCard: true },
    { key: 'owner', header: 'Owner', render: (d) => <Badge>{d.owner}</Badge>, hideOnCard: true },
    { key: 'effectivityDate', header: 'Effectivity', render: (d) => formatDate(d.effectivityDate), hideOnCard: true },
    { key: 'status', header: 'Status', render: (d) => d.status },
    { key: 'classification', header: 'Access', render: (d) => <Badge className={CLASS_STYLES[d.classification]}>{d.classification}</Badge> },
  ];

  return (
    <div>
      <PageHeader title="Documents and Policies" description="The institutional document and policy library, with version control and access classification." crumbs={[{ label: 'Documents and Policies' }]} />

      <Card>
        <CardContent className="pt-5">
          <Toolbar
            search={search} onSearchChange={setSearch} placeholder="Search documents…"
            onExport={() => exportToCsv('documents.csv', ['Title', 'Category', 'Version', 'Owner', 'Effectivity', 'Status', 'Classification'], filteredBase.map((d) => [d.title, d.category, d.version, d.owner, d.effectivityDate, d.status, d.classification]))}
            onPrint={() => window.print()}
          >
            <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto" aria-label="Filter by category">
              <option value="All">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={classification} onChange={(e) => setClassification(e.target.value)} className="w-auto" aria-label="Filter by access classification">
              <option value="All">All Classifications</option>
              {Object.keys(CLASS_STYLES).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter by status">
              <option value="All">All Statuses</option>
              <option>Active</option><option>Under Review</option><option>Superseded</option><option>Archived</option>
            </Select>
          </Toolbar>
          <DataTable columns={columns} rows={pageRows} getRowId={(d) => d.id} onRowClick={(d) => navigate(`/documents/${d.id}`)} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cardTitle={(d) => (
            <span className="flex items-center gap-1.5">{!canAccessDocument(d.classification, effectiveRole) && <Lock className="h-3.5 w-3.5 text-slate-400" />} {d.title}</span>
          )} />
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={10} />
        </CardContent>
      </Card>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Star className="h-3.5 w-3.5" /> Tip: use "View BES As" in the profile menu to preview access as Board Member or Auditor roles.</p>
    </div>
  );
}
