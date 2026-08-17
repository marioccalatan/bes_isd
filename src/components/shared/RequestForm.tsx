import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Send, X } from 'lucide-react';
import type { FieldDef, ProcessDef } from '@/lib/processDefs';
import { Input, Label, Select, Textarea, FieldError, Checkbox, FieldHint } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import type { ActivityEntry, Priority, WorkItem } from '@/lib/types';

function Field({ field, value, onChange, error }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const commonProps = { id: field.name, invalid: !!error };
  return (
    <div className={field.span === 'half' ? 'sm:col-span-1' : 'sm:col-span-2'}>
      <Label htmlFor={field.name} required={field.required}>{field.label}</Label>
      {field.type === 'textarea' && (
        <Textarea {...commonProps} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
      )}
      {field.type === 'select' && (
        <Select {...commonProps} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select {field.label.toLowerCase()}…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      )}
      {field.type === 'checkbox' && (
        <label className="mt-1.5 flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} /> Yes
        </label>
      )}
      {field.type === 'file' && (
        <div>
          <input
            type="file"
            id={field.name}
            onChange={(e) => onChange(e.target.files?.[0]?.name)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {typeof value === 'string' && value && <p className="mt-1 text-xs text-green-700">Attached: {value}</p>}
          <FieldHint>Simulated upload — no file is actually transmitted in this prototype.</FieldHint>
        </div>
      )}
      {(field.type === 'text' || field.type === 'date' || field.type === 'time' || field.type === 'number' || field.type === 'participants') && (
        <Input
          {...commonProps}
          type={field.type === 'participants' ? 'text' : field.type}
          value={(value as string | number) ?? ''}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          placeholder={field.type === 'participants' ? 'e.g. Names of participants' : field.placeholder}
        />
      )}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

export function RequestForm({ def, existingDraft }: { def: ProcessDef; existingDraft?: WorkItem }) {
  const navigate = useNavigate();
  const { submitWorkItem, saveDraft, updateWorkItem } = useData();
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, unknown>>(existingDraft?.fields ?? {});
  const [priority, setPriority] = useState<Priority>(existingDraft?.priority ?? 'Normal');
  const [purposeOverride, setPurposeOverride] = useState(existingDraft?.purpose ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function setField(name: string, v: unknown) {
    setValues((prev) => ({ ...prev, [name]: v }));
    setDirty(true);
    setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    def.fields.forEach((f) => {
      if (f.required && !values[f.name]) nextErrors[f.name] = `${f.label} is required.`;
    });
    if (def.fields.some((f) => f.name === 'dateFrom') && def.fields.some((f) => f.name === 'dateTo')) {
      const from = values.dateFrom as string;
      const to = values.dateTo as string;
      if (from && to && new Date(to) < new Date(from)) {
        nextErrors.dateTo = 'End date cannot be earlier than the start date.';
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildPurpose(): string {
    if (purposeOverride) return purposeOverride;
    const p = (values.reason || values.purpose || values.description || values.expectedOutput || values.background) as string | undefined;
    return p || def.summary;
  }

  function handleSaveDraft() {
    const title = def.titleFromFields?.(values) ?? def.title;
    const item = saveDraft(
      {
        processType: def.type, title, requestorId: CURRENT_EMPLOYEE.id, requestorName: CURRENT_EMPLOYEE.name,
        departmentId: CURRENT_EMPLOYEE.departmentId, dateSubmitted: '', status: 'Draft', priority,
        purpose: buildPurpose(), fields: values, attachments: [],
      },
      def.refPrefix,
      existingDraft?.id
    );
    setDirty(false);
    toast({ kind: 'success', title: 'Draft saved', description: `${item.id} was saved to your Drafts.` });
    navigate(`/my-work/${item.id}`);
  }

  function handleSubmit() {
    if (!validate()) {
      toast({ kind: 'error', title: 'Please fix the highlighted fields', description: 'Some required information is missing or invalid.' });
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      const title = def.titleFromFields?.(values) ?? def.title;
      const freshChain = def.approvalChain(values).map((s, i) => ({ ...s, id: `AP-${i}`, status: 'Pending' as const }));

      if (existingDraft && existingDraft.status !== 'Draft') {
        const resubmitEntry: ActivityEntry = { id: `ACT-${Date.now()}`, timestamp: new Date().toISOString(), actor: CURRENT_EMPLOYEE.name, action: 'Edited and resubmitted request' };
        updateWorkItem(existingDraft.id, {
          title, priority, purpose: buildPurpose(), fields: values,
          status: 'Submitted', dateSubmitted: new Date().toISOString().slice(0, 10),
          approvalChain: freshChain, activity: [...existingDraft.activity, resubmitEntry],
        });
        setSubmitting(false);
        setDirty(false);
        toast({ kind: 'success', title: 'Request resubmitted', description: `${existingDraft.id} has been resubmitted for approval.` });
        navigate(`/my-work/${existingDraft.id}`);
        return;
      }

      if (existingDraft && existingDraft.status === 'Draft') {
        const submitEntry: ActivityEntry = { id: `ACT-${Date.now()}`, timestamp: new Date().toISOString(), actor: CURRENT_EMPLOYEE.name, action: 'Submitted request' };
        updateWorkItem(existingDraft.id, {
          title, priority, purpose: buildPurpose(), fields: values,
          status: 'Submitted', dateSubmitted: new Date().toISOString().slice(0, 10),
          approvalChain: freshChain, activity: [...existingDraft.activity, submitEntry],
        });
        setSubmitting(false);
        setDirty(false);
        toast({ kind: 'success', title: 'Request submitted successfully', description: `Reference number ${existingDraft.id} has been generated.` });
        navigate(`/my-work/${existingDraft.id}`);
        return;
      }

      const item = submitWorkItem(
        {
          processType: def.type, title, requestorId: CURRENT_EMPLOYEE.id, requestorName: CURRENT_EMPLOYEE.name,
          departmentId: CURRENT_EMPLOYEE.departmentId, dateSubmitted: new Date().toISOString().slice(0, 10),
          status: 'Submitted', priority, purpose: buildPurpose(), fields: values, attachments: [],
          approvalChain: freshChain,
        },
        def.refPrefix
      );
      setSubmitting(false);
      setDirty(false);
      toast({ kind: 'success', title: 'Request submitted successfully', description: `Reference number ${item.id} has been generated.` });
      navigate(`/my-work/${item.id}`);
    }, 600);
  }

  function handleCancel() {
    if (dirty && !window.confirm('You have unsaved changes. Discard them and leave this form?')) return;
    navigate(-1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{def.title}</CardTitle>
        <p className="text-xs text-slate-500">{def.summary}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {def.fields.map((f) => (
            <Field key={f.name} field={f} value={values[f.name]} onChange={(v) => setField(f.name, v)} error={errors[f.name]} />
          ))}
          <div className="sm:col-span-1">
            <Label htmlFor="priority">Priority</Label>
            <Select id="priority" value={priority} onChange={(e) => { setPriority(e.target.value as Priority); setDirty(true); }}>
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </Select>
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="purpose-override">Purpose / Summary (optional override)</Label>
            <Input id="purpose-override" value={purposeOverride} onChange={(e) => { setPurposeOverride(e.target.value); setDirty(true); }} placeholder="Auto-filled from your description if left blank" />
          </div>
        </div>

        {def.approvalChain(values).length > 0 && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Approval Routing Preview</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              {def.approvalChain(values).map((s, i) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-300 bg-surface px-2.5 py-1 font-medium">{s.stepName}</span>
                  {i < def.approvalChain(values).length - 1 && <span className="text-slate-300">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="outline" onClick={handleCancel}><X className="h-4 w-4" /> Cancel</Button>
          <Button variant="outline" onClick={handleSaveDraft}><Save className="h-4 w-4" /> Save as Draft</Button>
          <Button onClick={handleSubmit} disabled={submitting}><Send className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit Request'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
