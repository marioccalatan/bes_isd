import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { addTrainingParticipants, fetchTrainingParticipants, fetchHrEmployees, type HrEmployee, type TrainingSeminar } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';

export function TrainingParticipantsDialog({ training, onClose }: { training: TrainingSeminar; onClose: () => void }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setLoading(false); setError('Sign in to add participants.'); return; }
    Promise.all([fetchHrEmployees(token), fetchTrainingParticipants(token, training.id)])
      .then(([people, participants]) => { if (!cancelled) { setEmployees(people); setExisting(participants.employeeNos); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load employees.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, training.id, attempt]);
  const name = (employee: HrEmployee) => `${employee.lastName}, ${employee.firstName}${employee.middleName ? ` ${employee.middleName}` : ''}`;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = employees.filter((employee) => {
    const text = [name(employee), employee.employeeNo, employee.departmentName, employee.departmentShort].join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  });
  async function save() {
    if (!token || saving || !selected.length) return;
    setSaving(true); setError('');
    try {
      const result = await addTrainingParticipants(token, training.id, selected);
      toast({ kind: 'success', title: `${result.added} participant${result.added === 1 ? '' : 's'} added` });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add participants.'); }
    finally { setSaving(false); }
  }
  return <Dialog open onClose={() => { if (!saving) onClose(); }} title="Add Participants" description={`${training.name}${training.dateFrom ? ` · ${formatDate(training.dateFrom)}` : ''}`} size="xl" footer={<><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={loading || saving || !selected.length} onClick={() => void save()}>{saving ? 'Saving…' : `Add Participants (${selected.length})`}</Button></>}>
    {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading employees and participants…</p> : <div className="space-y-3">
      {error && <div role="alert" className="space-y-2"><p className="text-sm text-red-600">{error}</p>{!employees.length && <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div>}
      <p className="text-sm text-slate-500">{existing.length} already added · {selected.length} selected to add</p>
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <details className="min-w-0 rounded-md border border-slate-300 bg-surface">
        <summary className="cursor-pointer rounded-md px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Employees · {selected.length ? `${selected.length} selected` : 'Select employees'}</summary>
        <div className="space-y-2 border-t border-slate-200 p-3">
          <Input aria-label="Search employees" placeholder="Search name, employee number, or department…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <p className="text-xs text-slate-500">{matches.length} matching employees. Selections are kept when you search.</p>
          <div role="group" aria-label="Employees" className="max-h-64 space-y-1 overflow-y-auto">
            {matches.map((employee) => { const enrolled = existing.includes(employee.employeeNo); return <label key={employee.employeeNo} className="flex items-start gap-3 rounded-md p-2 text-sm hover:bg-slate-50"><Checkbox className="mt-1 shrink-0" checked={enrolled || selected.includes(employee.employeeNo)} disabled={saving || enrolled} onChange={(event) => { const checked = event.target.checked; setSelected((current) => checked ? [...current, employee.employeeNo] : current.filter((id) => id !== employee.employeeNo)); }} /><span className="min-w-0"><span className="block font-medium text-slate-800">{name(employee)}</span><span className="block text-xs text-slate-500">{employee.employeeNo} · {employee.departmentName || employee.departmentShort || 'No department'}{enrolled ? ' · Already added' : ''}</span></span></label>; })}
            {!matches.length && <p className="p-4 text-sm text-slate-500">No employees match your search.</p>}
          </div>
        </div>
      </details>
      <section aria-labelledby="selected-employees-title" className="min-w-0 rounded-md border border-slate-300 bg-surface">
        <div className="border-b border-slate-200 px-3 py-2"><h3 id="selected-employees-title" className="text-sm font-semibold text-slate-900">Selected Employees ({selected.length})</h3></div>
        {selected.length ? <ul className="max-h-80 overflow-y-auto p-1">
          {employees.filter((employee) => selected.includes(employee.employeeNo)).map((employee) => <li key={employee.employeeNo} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-slate-50"><span className="min-w-0 flex-1 truncate text-xs text-slate-800" title={`${name(employee)} · ${employee.employeeNo} · ${employee.departmentName || employee.departmentShort || 'No department'}`}>{name(employee)}</span><Button type="button" variant="ghost" size="icon" className="!h-6 !w-6 shrink-0" disabled={saving} aria-label={`Deselect ${name(employee)}`} onClick={() => setSelected((current) => current.filter((id) => id !== employee.employeeNo))}><X className="h-3.5 w-3.5" /></Button></li>)}
        </ul> : <p className="px-3 py-8 text-center text-sm text-slate-500">No employees selected. Choose employees from the list.</p>}
      </section>
      </div>
    </div>}
  </Dialog>;
}
