import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';

export function SignupDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (username: string) => void }) {
  const [form, setForm] = useState({ employeeNo: '', firstName: '', lastName: '', email: '', username: '', password: '', confirmPassword: '', departmentCode: '', positionTitle: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify(form) });
      onCreated(form.username);
      setForm({ employeeNo: '', firstName: '', lastName: '', email: '', username: '', password: '', confirmPassword: '', departmentCode: '', positionTitle: '' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create account.'); }
    finally { setLoading(false); }
  }

  return <Dialog open={open} onClose={onClose} title="Create BES Account" description="Register your account and initial employee master record." size="lg">
    <form onSubmit={submit} className="space-y-4">
      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="signup-employee" required>Employee number</Label><Input id="signup-employee" value={form.employeeNo} onChange={(e) => set('employeeNo', e.target.value)} placeholder="BENECO-00127" required /></div>
        <div><Label htmlFor="signup-dept">Department</Label><Select id="signup-dept" value={form.departmentCode} onChange={(e) => set('departmentCode', e.target.value)}><option value="">Select department</option>{['ISD','NSD','NNSD','AUD','CPD','PGD'].map((code) => <option key={code}>{code}</option>)}</Select></div>
        <div><Label htmlFor="signup-first" required>First name</Label><Input id="signup-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required /></div>
        <div><Label htmlFor="signup-last" required>Last name</Label><Input id="signup-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required /></div>
        <div className="sm:col-span-2"><Label htmlFor="signup-position">Position title</Label><Input id="signup-position" value={form.positionTitle} onChange={(e) => set('positionTitle', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="signup-email" required>Work email</Label><Input id="signup-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="employee@beneco.com.ph" required /></div>
        <div className="sm:col-span-2"><Label htmlFor="signup-username" required>Username</Label><Input id="signup-username" autoComplete="username" value={form.username} onChange={(e) => set('username', e.target.value)} required /></div>
        <div><Label htmlFor="signup-password" required>Password</Label><Input id="signup-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required /><p className="mt-1 text-xs text-slate-500">At least 8 characters.</p></div>
        <div><Label htmlFor="signup-confirm" required>Confirm password</Label><Input id="signup-confirm" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} minLength={8} required /></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={loading}><UserPlus className="h-4 w-4" />{loading ? 'Creating…' : 'Create Account'}</Button></div>
    </form>
  </Dialog>;
}
