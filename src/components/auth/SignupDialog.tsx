import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { apiRequest, fetchRegistrationOptions, type OrgDepartment } from '@/lib/api';

const EMPTY_FORM = {
  employeeNo: '', username: '', email: '', mobileNo: '', firstName: '', middleName: '',
  lastName: '', suffix: '', position: '', departmentCode: '', unitName: '',
  employmentStatus: 'Active', password: '', confirmPassword: '',
};

export function SignupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (username: string) => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const selectedDepartment = useMemo(() => departments.find((department) => department.code === form.departmentCode), [departments, form.departmentCode]);
  const selectedOffice = useMemo(() => selectedDepartment?.offices.find((office) => office.name === form.unitName), [form.unitName, selectedDepartment]);
  const positions = selectedOffice?.positions ?? selectedDepartment?.positions ?? [];

  useEffect(() => {
    if (!open || departments.length) return;
    fetchRegistrationOptions()
      .then(setDepartments)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load departments, offices, and positions.'));
  }, [departments.length, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify(form) });
      onCreated(form.username);
      setForm(EMPTY_FORM);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create account.');
    } finally {
      setLoading(false);
    }
  }

  return <Dialog open={open} onClose={onClose} title="Create BES Account" description="Register your account and initial employee master record." size="lg">
    <form onSubmit={submit} className="space-y-4">
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="signup-employee" required>Employee ID</Label><Input id="signup-employee" value={form.employeeNo} onChange={(event) => set('employeeNo', event.target.value)} placeholder="991014" required /></div>
        <div><Label htmlFor="signup-username" required>Username</Label><Input id="signup-username" autoComplete="username" value={form.username} onChange={(event) => set('username', event.target.value)} placeholder="mario.calatan" required /></div>
        <div><Label htmlFor="signup-email" required>Email</Label><Input id="signup-email" type="email" autoComplete="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="employee@beneco.com.ph" required /></div>
        <div><Label htmlFor="signup-mobile">Mobile No.</Label><Input id="signup-mobile" inputMode="tel" autoComplete="tel" value={form.mobileNo} onChange={(event) => set('mobileNo', event.target.value)} placeholder="09XXXXXXXXX" /></div>
        <div><Label htmlFor="signup-first" required>First Name</Label><Input id="signup-first" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} required /></div>
        <div><Label htmlFor="signup-middle">Middle Name</Label><Input id="signup-middle" value={form.middleName} onChange={(event) => set('middleName', event.target.value)} /></div>
        <div><Label htmlFor="signup-last" required>Last Name</Label><Input id="signup-last" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} required /></div>
        <div><Label htmlFor="signup-suffix">Suffix</Label><Input id="signup-suffix" value={form.suffix} onChange={(event) => set('suffix', event.target.value)} placeholder="e.g. Jr., III" /></div>
        <div><Label htmlFor="signup-dept">Department</Label><Select id="signup-dept" value={form.departmentCode} onChange={(event) => setForm((current) => ({ ...current, departmentCode: event.target.value, unitName: '', position: '' }))}><option value="">Select department</option>{departments.map((department) => <option key={department.code} value={department.code}>{department.code} — {department.name}</option>)}</Select></div>
        <div><Label htmlFor="signup-unit">Office / Unit</Label><Select id="signup-unit" value={form.unitName} onChange={(event) => setForm((current) => ({ ...current, unitName: event.target.value, position: '' }))} disabled={!selectedDepartment}><option value="">Department level / no office</option>{selectedDepartment?.offices.map((office) => <option key={office.id} value={office.name}>{office.name}</option>)}</Select></div>
        <div><Label htmlFor="signup-position">Position</Label><Select id="signup-position" value={form.position} onChange={(event) => set('position', event.target.value)} disabled={!selectedDepartment}><option value="">Select position</option>{positions.map((position) => <option key={position.id} value={position.title}>{position.title}</option>)}</Select></div>
        <div><Label htmlFor="signup-password" required>Password</Label><Input id="signup-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => set('password', event.target.value)} minLength={8} required /><p className="mt-1 text-xs text-slate-500">At least 8 characters.</p></div>
        <div><Label htmlFor="signup-confirm" required>Confirm Password</Label><Input id="signup-confirm" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => set('confirmPassword', event.target.value)} minLength={8} required /></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={loading}><UserPlus className="h-4 w-4" />{loading ? 'Creating…' : 'Create Account'}</Button></div>
    </form>
  </Dialog>;
}
