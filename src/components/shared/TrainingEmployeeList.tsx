import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { addTrainingParticipants, fetchTrainingEmployees, type TrainingEmployee, type TrainingSeminar } from '@/lib/api';
import { useTableControls } from '@/hooks/useTableControls';
import { formatDate } from '@/lib/utils';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TrainingEmployeeList({ programs, year, search, onSaved }: {
  programs: TrainingSeminar[]; year: string; search: string; onSaved: (id: string, count: number) => void;
}) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<TrainingEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [employee, setEmployee] = useState<TrainingEmployee | null>(null);
  const [mode, setMode] = useState<'view' | 'add'>('view');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setLoading(false); setError('Sign in to view employees.'); return; }
    fetchTrainingEmployees(token).then((result) => { if (!cancelled) setEmployees(result.employees); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load employees.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  const scoped = programs.filter((row) => !year || (year === 'undated' ? !row.dateFrom : row.dateFrom?.startsWith(`${year}-`)));
  const rows = employees.map((person) => ({ ...person, attended: scoped.filter((row) => row.status === 'Implemented' && person.trainingIds.includes(row.id)).length }))
    .filter((person) => `${person.name} ${person.employeeNo}`.toLowerCase().includes(search.toLowerCase()));
  const table = useTableControls(rows, () => true, 20);
  useEffect(() => { table.setPage(1); }, [search, year]);
  function open(person: TrainingEmployee, next: 'view' | 'add') { setEmployee(person); setMode(next); setQuery(''); setSaveError(''); }
  async function add(program: TrainingSeminar) {
    if (!token || !employee || saving) return;
    setSaving(true); setSaveError('');
    try {
      const result = await addTrainingParticipants(token, program.id, [employee.employeeNo]);
      const updated = { ...employee, trainingIds: [...new Set([...employee.trainingIds, program.id])] };
      setEmployee(updated);
      setEmployees((current) => current.map((person) => person.employeeNo === updated.employeeNo ? updated : person));
      onSaved(program.id, result.employeeNos.length);
    } catch (reason) { setSaveError(reason instanceof Error ? reason.message : 'Unable to add training.'); }
    finally { setSaving(false); }
  }
  const columns: Column<typeof rows[number]>[] = [
    { key: 'name', header: 'Employee', sortable: true, render: (row) => row.name },
    { key: 'employeeNo', header: 'Employee No.', sortable: true, render: (row) => row.employeeNo },
    { key: 'attended', header: 'Trainings Attended', sortable: true, render: (row) => row.attended.toLocaleString() },
    { key: 'actions', header: 'Actions', render: (person) => <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => open(person, 'view')}>View</Button><Button size="sm" variant="outline" disabled={!person.active} onClick={() => open(person, 'add')}>Add</Button></div> },
  ];
  const modalRows = (mode === 'view' ? scoped.filter((row) => employee?.trainingIds.includes(row.id)) : programs)
    .filter((row) => `${row.name} ${row.dateFrom ?? ''} ${row.conductedBy ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <p className="mb-3 text-xs text-slate-500">Trainings attended counts Implemented sessions for {year === 'undated' ? 'records without a start date' : year || 'all years'}. Inactive employees with training records are included.</p>
    {loading ? <p role="status">Loading employees…</p> : error ? <div role="alert"><p>{error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : <>
      <DataTable columns={columns} rows={table.pageRows} getRowId={(row) => row.employeeNo} cardTitle={(row) => row.name} sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} emptyTitle="No employees found" />
      <Pagination page={table.page} pageCount={table.pageCount} onChange={table.setPage} total={table.filteredCount} pageSize={20} />
    </>}
    {employee && <Dialog open title={mode === 'view' ? 'Employee Trainings' : 'Add Training for Employee'} description={`${employee.name} · ${employee.employeeNo}`} size="lg" onClose={() => { if (!saving) setEmployee(null); }} footer={<><Button variant="outline" disabled={saving} onClick={() => setEmployee(null)}>Close</Button>{mode === 'view' && employee.active && <Button onClick={() => open(employee, 'add')}>Add Training</Button>}</>}>
      <p className="mb-3 text-xs text-slate-500">{mode === 'view' ? `Training records for ${year === 'undated' ? 'no start date' : year || 'all years'}.` : 'Choose an existing training session from any year. Already added sessions are marked.'}</p>
      <Input aria-label="Search employee trainings" placeholder="Search training, date, organizer…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {saveError && <p role="alert" className="mt-2 text-sm text-red-600">{saveError}</p>}
      <ul className="mt-3 max-h-96 divide-y divide-slate-200 overflow-y-auto">{modalRows.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.dateFrom ? formatDate(row.dateFrom) : 'No date'} · {row.dateTo ? formatDate(row.dateTo) : 'No end date'} · {row.status || 'No status'} · {row.hours ?? 0} hours</p></div>{mode === 'add' && <Button size="sm" variant="outline" disabled={saving || employee.trainingIds.includes(row.id)} onClick={() => void add(row)}>{employee.trainingIds.includes(row.id) ? 'Added' : 'Add'}</Button>}</li>)}</ul>
      {!modalRows.length && <p className="py-6 text-sm text-slate-500">No trainings found.</p>}
    </Dialog>}
  </>;
}
