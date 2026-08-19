import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { apiRequest } from '@/lib/api';

export function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'verify'|'reset'|'done'>('verify');
  const [identifier, setIdentifier] = useState(''); const [employeeNo, setEmployeeNo] = useState('');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [token, setToken] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const close = () => { setStep('verify'); setError(''); setPassword(''); setConfirm(''); setToken(''); onClose(); };
  async function verify(event: FormEvent) { event.preventDefault(); setLoading(true); setError(''); try { const result = await apiRequest<{ resetToken: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier, employeeNo }) }); setToken(result.resetToken); setStep('reset'); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to verify account.'); } finally { setLoading(false); } }
  async function reset(event: FormEvent) { event.preventDefault(); if (password !== confirm) return setError('Passwords do not match.'); setLoading(true); setError(''); try { await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken: token, password }) }); setStep('done'); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reset password.'); } finally { setLoading(false); } }
  return <Dialog open={open} onClose={close} title="Reset Password" description="Verify your BES employee account, then choose a new password." size="sm">
    {error && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {step === 'verify' && <form onSubmit={verify} className="space-y-3"><div><Label htmlFor="reset-identifier" required>Username or work email</Label><Input id="reset-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required /></div><div><Label htmlFor="reset-employee" required>Employee number</Label><Input id="reset-employee" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} placeholder="BENECO-00127" required /></div><Button type="submit" disabled={loading} className="w-full"><KeyRound className="h-4 w-4" />{loading ? 'Verifying…' : 'Verify Account'}</Button></form>}
    {step === 'reset' && <form onSubmit={reset} className="space-y-3"><div><Label htmlFor="reset-password" required>New password</Label><Input id="reset-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div><div><Label htmlFor="reset-confirm" required>Confirm new password</Label><Input id="reset-confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div><Button type="submit" disabled={loading} className="w-full">{loading ? 'Updating…' : 'Update Password'}</Button></form>}
    {step === 'done' && <div className="space-y-3"><p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">Your password has been updated. You can now sign in.</p><Button className="w-full" onClick={close}>Return to Sign In</Button></div>}
  </Dialog>;
}
