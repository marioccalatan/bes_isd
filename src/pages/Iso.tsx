import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useData } from '@/context/DataContext';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { formatDate } from '@/lib/utils';
import type { QmsDocument, QmsDocType } from '@/lib/types';

const TYPE_STYLES: Record<QmsDocType, string> = {
  'Procedure Manual': 'border-brand-200 bg-brand-50 text-brand-700',
  'Work Instruction': 'border-gold-200 bg-gold-50 text-gold-800',
  Guideline: 'border-green-200 bg-green-50 text-green-700',
  Form: 'border-slate-200 bg-slate-100 text-slate-600',
};

const STATUS_STYLES: Record<string, string> = {
  Controlled: 'border-green-200 bg-green-50 text-green-700',
  'Under Revision': 'border-gold-200 bg-gold-50 text-gold-800',
  Obsolete: 'border-slate-200 bg-slate-100 text-slate-500',
};

export default function Iso() {
  const { qmsDocuments, departments } = useData();
  const navigate = useNavigate();
  const [department, setDepartment] = useState('All');
  const [type, setType] = useState('All');

  const filteredBase = qmsDocuments.filter((d) => {
    if (department !== 'All' && d.departmentId !== department) return false;
    if (type !== 'All' && d.type !== type) return false;
    return true;
  });

  const { search, setSearch, sortKey, sortDir, toggleSort, page, setPage, pageCount, pageRows, filteredCount } = useTableControls(
    filteredBase, (d, q) => d.title.toLowerCase().includes(q) || d.code.toLowerCase().includes(q), 10
  );

  const columns: Column<QmsDocument>[] = [
    { key: 'code', header: 'Doc. No.', sortable: true, render: (d) => <span className="font-mono text-xs font-semibold text-slate-700">{d.code}</span> },
    { key: 'title', header: 'Title', sortable: true, render: (d) => <span className="font-medium text-slate-800">{d.title}</span> },
    { key: 'type', header: 'Type', render: (d) => <Badge className={TYPE_STYLES[d.type]}>{d.type}</Badge>, hideOnCard: true },
    { key: 'departmentId', header: 'Dept.', render: (d) => <Badge>{d.departmentId}</Badge> },
    { key: 'revisionNo', header: 'Rev.', render: (d) => d.revisionNo, hideOnCard: true },
    { key: 'effectiveDate', header: 'Effective Date', render: (d) => formatDate(d.effectiveDate), hideOnCard: true },
    { key: 'status', header: 'Status', render: (d) => <Badge className={STATUS_STYLES[d.status]}>{d.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="ISO / QMS"
        description="Controlled document registry for BENECO's ISO 9001:2015 Quality Management System."
        crumbs={[{ label: 'ISO / QMS' }]}
      />

      <Card className="mb-5">
        <CardContent className="flex items-center gap-3 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Award className="h-5 w-5" /></span>
          <p className="text-sm text-slate-600">
            BENECO is <span className="font-semibold text-slate-800">ISO 9001:2015 certified</span>. Every controlled document below carries a
            document number, revision number, and effective date, and is signed off by the preparer, the department manager, and the ISO Officer.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <Toolbar
            search={search} onSearchChange={setSearch} placeholder="Search by title or document number…"
            onExport={() => exportToCsv('iso-qms-documents.csv', ['Doc. No.', 'Title', 'Type', 'Department', 'Revision', 'Effective Date', 'Status'], filteredBase.map((d) => [d.code, d.title, d.type, d.departmentId, d.revisionNo, d.effectiveDate, d.status]))}
            onPrint={() => window.print()}
          >
            <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-auto" aria-label="Filter by department">
              <option value="All">All Departments</option>
              {departments.map((dpt) => <option key={dpt.id} value={dpt.id}>{dpt.shortName}</option>)}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Filter by document type">
              <option value="All">All Types</option>
              {Object.keys(TYPE_STYLES).map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Toolbar>
          <DataTable
            columns={columns} rows={pageRows} getRowId={(d) => d.id}
            onRowClick={(d) => navigate(`/iso/${d.id}`)}
            sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}
            cardTitle={(d) => <span className="flex items-center gap-1.5"><span className="font-mono text-xs text-slate-400">{d.code}</span> {d.title}</span>}
            emptyTitle="No controlled documents found"
            emptyDescription="Try adjusting your filters or search terms."
          />
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={10} />
        </CardContent>
      </Card>
    </div>
  );
}
