import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Pencil, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchTrainingSeminars, saveTrainingSeminar, type TrainingSeminar } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/lib/utils';
import { useTableControls } from '@/hooks/useTableControls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select } from '@/components/ui/input';
import { Toolbar } from './Toolbar';
import { TrainingParticipantsDialog } from './TrainingParticipantsDialog';

const TRAINING_CATEGORIES = [
  'Mandatory, Regulatory & Compliance',
  'Technical & Functional Competency',
  'Safety, Health & Emergency Preparedness',
  'Leadership & Management Development',
  'Behavioral & Interpersonal Effectiveness',
  'Customer Service & Stakeholder Relations',
  'Digital, Data & Emerging Technology',
  'Professional & Career Development',
  'Academic & Advanced Development',
  'Organizational & Strategic Capability',
];

const columns: Column<TrainingSeminar>[] = [
  { key: 'name', header: 'Training / Seminar', sortable: true, render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
  { key: 'address', header: 'Address / Venue', sortable: true, render: (row) => row.address || '—' },
  { key: 'dateFrom', header: 'Start Date', sortable: true, render: (row) => row.dateFrom ? formatDate(row.dateFrom) : '—' },
  { key: 'dateTo', header: 'End Date', sortable: true, render: (row) => row.dateTo ? formatDate(row.dateTo) : '—' },
  { key: 'hours', header: 'Hours', sortable: true, render: (row) => row.hours ?? '—' },
  { key: 'type', header: 'Type', sortable: true, render: (row) => row.type || '—' },
  { key: 'conductedBy', header: 'Conducted By', sortable: true, render: (row) => row.conductedBy || '—' },
];

export function LearningPrograms({ onCountChange }: { onCountChange: (count: number) => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [programs, setPrograms] = useState<TrainingSeminar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [year, setYear] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [participantTraining, setParticipantTraining] = useState<TrainingSeminar | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const emptyForm = { name: '', address: '', dateFrom: '', dateTo: '', hours: '', type: '', conductedBy: '', status: '', workplan: '', categories: [] as string[] };
  const [form, setForm] = useState(emptyForm);
  const years = useMemo(() => [...new Set(programs.flatMap((row) => row.dateFrom ? [row.dateFrom.slice(0, 4)] : []))].sort().reverse(), [programs]);
  const yearPrograms = useMemo(() => programs.filter((row) => !year || (year === 'undated' ? !row.dateFrom : row.dateFrom?.startsWith(`${year}-`))), [programs, year]);
  const table = useTableControls(yearPrograms, (row, query) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)), 20);

  function openForm(row?: TrainingSeminar) {
    setEditingId(row?.id);
    setForm(row ? { name: row.name, address: row.address ?? '', dateFrom: row.dateFrom ?? '', dateTo: row.dateTo ?? '', hours: row.hours == null ? '' : String(row.hours), type: row.type ?? '', conductedBy: row.conductedBy ?? '', status: row.status ?? '', workplan: row.workplan ?? '', categories: row.categories ?? [] } : emptyForm);
    setFormError('');
    setOpen(true);
  }

  async function submit() {
    if (!token || saving) return;
    setFormError('');
    if (!form.name.trim()) { setFormError('Training / Seminar name is required.'); return; }
    if (form.dateFrom && form.dateTo && form.dateTo < form.dateFrom) { setFormError('End date must be on or after start date.'); return; }
    const hours = form.hours === '' ? null : Number(form.hours);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 99999999.99 || Math.abs(hours * 100 - Math.round(hours * 100)) > 0.000001)) { setFormError('Hours must be a non-negative number with at most two decimal places.'); return; }
    setSaving(true);
    try {
      const saved = await saveTrainingSeminar(token, { ...form, name: form.name.trim(), hours, dateFrom: form.dateFrom || null, dateTo: form.dateTo || null }, editingId);
      const updated = editingId ? programs.map((row) => row.id === editingId ? saved : row) : [saved, ...programs];
      setPrograms(updated);
      onCountChange(updated.length);
      setOpen(false);
      toast({ kind: 'success', title: editingId ? 'Training program updated' : 'Training program added' });
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Unable to save training program.');
    } finally { setSaving(false); }
  }

  const tableColumns: Column<TrainingSeminar>[] = canEdit ? [...columns, { key: 'participants', header: 'Participants', render: (row) => <Button variant="outline" size="sm" onClick={() => setParticipantTraining(row)}>Add Participants</Button> }, { key: 'actions', header: 'Edit', render: (row) => <Button variant="ghost" size="icon" aria-label={`Edit ${row.name}`} onClick={() => openForm(row)}><Pencil className="h-4 w-4" /></Button> }] : columns;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPrograms([]);
    setCanEdit(false);
    if (!token) { setLoading(false); setError('Sign in to view training programs.'); return; }
    fetchTrainingSeminars(token).then(({ programs: rows, canEdit: editable }) => {
      if (!cancelled) { setPrograms(rows); setCanEdit(editable); onCountChange(rows.length); }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load training programs.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt, onCountChange]);

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle>Learning and Development Programs</CardTitle><p className="mt-1 text-sm text-slate-500">Training and seminar schedules, venues, hours, and organizers.</p></div><div className="flex items-center gap-2"><a href={`/workspace/learning-development?view=summary${year ? `&year=${encodeURIComponent(year)}` : ''}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-surface px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Summary (opens in a new tab)"><BarChart3 className="h-4 w-4" /> Summary</a>{canEdit && <Button onClick={() => openForm()}><Plus className="h-4 w-4" /> Add</Button>}</div></CardHeader>
    <CardContent>
      <Toolbar search={table.search} onSearchChange={table.setSearch} placeholder="Search training, venue, type, organizer…" onPrint={() => window.print()}>
        <div className="flex items-center gap-2"><label htmlFor="training-year" className="text-sm text-slate-500">Year</label><Select id="training-year" className="w-36" value={year} onChange={(event) => { setYear(event.target.value); table.setPage(1); }}><option value="">All Years</option>{years.map((value) => <option key={value} value={value}>{value}</option>)}{programs.some((row) => !row.dateFrom) && <option value="undated">No start date</option>}</Select></div>
      </Toolbar>
      {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">Loading training programs…</p> : error ? <div role="alert" className="space-y-3 py-8 text-center"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : <>
        <DataTable columns={tableColumns} rows={table.pageRows} getRowId={(row) => row.id} sortKey={table.sortKey} sortDir={table.sortDir} onSort={table.toggleSort} cardTitle={(row) => row.name} minWidthPx={1160} emptyTitle="No training programs found" emptyDescription={table.search || year ? 'Try a different year or search term.' : 'No training or seminar records are available.'} />
        <Pagination page={table.page} pageCount={table.pageCount} onChange={table.setPage} total={table.filteredCount} pageSize={20} />
      </>}
    </CardContent>
    <Dialog open={open} onClose={() => { if (!saving) setOpen(false); }} title={editingId ? 'Edit Training / Seminar' : 'Add Training / Seminar'} size="lg" footer={<><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="training-program-form" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Program'}</Button></>}>
      <form id="training-program-form" className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        {formError && <p role="alert" className="text-sm text-red-600 sm:col-span-2">{formError}</p>}
        <div className="sm:col-span-2"><Label htmlFor="training-name" required>Training / Seminar</Label><Input id="training-name" required maxLength={1000} disabled={saving} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
        <div className="sm:col-span-2"><Label htmlFor="training-address">Address / Venue</Label><Input id="training-address" maxLength={1000} disabled={saving} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></div>
        <div><Label htmlFor="training-start">Start Date</Label><Input id="training-start" type="date" disabled={saving} value={form.dateFrom} onChange={(event) => setForm({ ...form, dateFrom: event.target.value })} /></div>
        <div><Label htmlFor="training-end">End Date</Label><Input id="training-end" type="date" min={form.dateFrom || undefined} disabled={saving} value={form.dateTo} onChange={(event) => setForm({ ...form, dateTo: event.target.value })} /></div>
        <div><Label htmlFor="training-hours">Hours</Label><Input id="training-hours" type="number" min="0" max="99999999.99" step="0.01" disabled={saving} value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></div>
        <div><Label htmlFor="training-type">Type</Label><Select id="training-type" disabled={saving} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="">Select type</option>{[...new Set(['IN-HOUSE', 'OFF-PLANT', ...programs.flatMap((row) => row.type ? [row.type] : [])])].map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>
        <div><Label htmlFor="training-status">Status</Label><Select id="training-status" disabled={saving} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="">Select status</option><option value="Scheduled">Scheduled</option><option value="Implemented">Implemented</option></Select></div>
        <div><Label htmlFor="training-workplan">Workplan</Label><Select id="training-workplan" disabled={saving} value={form.workplan} onChange={(event) => setForm({ ...form, workplan: event.target.value })}><option value="">Select workplan</option><option value="Workplan">Workplan</option><option value="Additional">Additional</option></Select></div>
        <div className="sm:col-span-2">
          <span id="training-category-label" className="mb-1 block text-sm font-medium text-slate-700">Category</span>
          <details className="rounded-md border border-slate-300 bg-surface">
            <summary aria-labelledby="training-category-label training-category-summary" className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><span id="training-category-summary">{form.categories.length ? `${form.categories.length} selected` : 'Select categories'}</span></summary>
            <div role="group" aria-labelledby="training-category-label" className="max-h-52 space-y-1 overflow-y-auto border-t border-slate-200 p-2">
              {TRAINING_CATEGORIES.map((category) => <label key={category} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><Checkbox disabled={saving} className="mt-0.5 shrink-0" checked={form.categories.includes(category)} onChange={(event) => { const checked = event.target.checked; setForm((current) => ({ ...current, categories: checked ? [...current.categories, category] : current.categories.filter((value) => value !== category) })); }} /><span>{category}</span></label>)}
            </div>
          </details>
          {form.categories.length > 0 && <p className="mt-2 text-xs text-slate-500">{form.categories.join('; ')}</p>}
        </div>
        <div className="sm:col-span-2"><Label htmlFor="training-organizer">Conducted By</Label><Input id="training-organizer" maxLength={2000} disabled={saving} value={form.conductedBy} onChange={(event) => setForm({ ...form, conductedBy: event.target.value })} /></div>
      </form>
    </Dialog>
    {participantTraining && <TrainingParticipantsDialog key={participantTraining.id} training={participantTraining} onClose={() => setParticipantTraining(null)} />}
  </Card>;
}
