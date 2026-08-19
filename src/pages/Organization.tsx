import { useNavigate } from 'react-router-dom';
import { Pencil, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/input';
import { OrgChartCanvas } from '@/components/shared/OrgChartCanvas';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useTableControls } from '@/hooks/useTableControls';
import { initials } from '@/lib/utils';
import { useState } from 'react';
import type { Employee } from '@/lib/types';

export default function Organization() {
  const { departments, employees, enterpriseOrgChart, updateEnterpriseOrgChart } = useData();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deptFilter, setDeptFilter] = useState('All');
  const [editingChart, setEditingChart] = useState(false);

  const baseRows = deptFilter === 'All' ? employees : employees.filter((e) => e.departmentId === deptFilter);
  const { search, setSearch, page, setPage, pageCount, pageRows, filteredCount } = useTableControls(
    baseRows, (e, q) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q), 10
  );

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'Name', render: (e) => (
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{initials(e.name)}</span>
        <span className="font-medium text-slate-800">{e.name}</span>
      </span>
    ) },
    { key: 'position', header: 'Position', render: (e) => e.position },
    { key: 'departmentId', header: 'Department', render: (e) => <Badge>{e.departmentId}</Badge> },
    { key: 'unit', header: 'Unit', render: (e) => e.unit, hideOnCard: true },
    { key: 'status', header: 'Status', render: (e) => e.status, hideOnCard: true },
  ];

  return (
    <div>
      <PageHeader title="Organization" description="Organizational hierarchy, department directory, and employee directory." crumbs={[{ label: 'Organization' }]} />

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Organizational Hierarchy</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditingChart((v) => !v)}>
            {editingChart ? <><X className="h-3.5 w-3.5" /> Done</> : <><Pencil className="h-3.5 w-3.5" /> Edit Chart</>}
          </Button>
        </CardHeader>
        <CardContent>
          <OrgChartCanvas
            chart={enterpriseOrgChart}
            editable={editingChart}
            height="480px"
            onSave={(chart) => {
              updateEnterpriseOrgChart(chart);
              toast({ kind: 'success', title: 'Organizational chart saved' });
              setEditingChart(false);
            }}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Department Directory</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <button key={d.id} onClick={() => navigate(`/organization/${d.id}`)} className="rounded-lg border border-slate-200 p-3.5 text-left hover:border-brand-300 hover:bg-brand-50/40">
                <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{d.mandate}</p>
                <p className="mt-2 text-xs font-medium text-brand-600">{d.employeeCount} employees</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Employee Directory</CardTitle></CardHeader>
        <CardContent>
          <Toolbar search={search} onSearchChange={setSearch} placeholder="Search by name or position…">
            <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-auto" aria-label="Filter by department">
              <option value="All">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.shortName}</option>)}
            </Select>
          </Toolbar>
          <DataTable columns={columns} rows={pageRows} getRowId={(e) => e.id} onRowClick={(e) => navigate(`/organization/employee/${e.id}`)} cardTitle={(e) => e.name} />
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={10} />
        </CardContent>
      </Card>
    </div>
  );
}
