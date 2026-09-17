import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { manageResourcePersons, fetchResourcePersonProfile, type ResourcePersonInput, type TrainingResourcePerson } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';

const empty: ResourcePersonInput = { lastName: '', firstName: '', middleName: '', company: '', specializations: '', email: '', contactNumber: '', affiliation: '' };
export function TrainingResourcePersonManager({ onClose = () => {}, onUse, embedded = false }: { onClose?: () => void; onUse?: (person: TrainingResourcePerson) => void; embedded?: boolean }) {
  const { token } = useAuth();
  const [people, setPeople] = useState<TrainingResourcePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [id, setId] = useState<string>();
  const [form, setForm] = useState<ResourcePersonInput>(empty);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [removing, setRemoving] = useState<TrainingResourcePerson | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setError('Sign in to manage resource persons.'); setLoading(false); return; }
    manageResourcePersons(token).then((result) => { if (!cancelled) setPeople(result.people); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load resource persons.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  function edit(person?: TrainingResourcePerson) {
    setId(person?.id); setForm(person ? { lastName: person.lastName, firstName: person.firstName, middleName: person.middleName, company: person.company, specializations: person.specializations, email: person.email, contactNumber: person.contactNumber, affiliation: person.affiliation } : empty);
    setProfileName(person?.profileName ?? null); setFileKey((key) => key + 1); setEditing(true); setRemoving(null); setError('');
  }
  async function save(remove?: TrainingResourcePerson) {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const result = await manageResourcePersons(token, remove ? 'DELETE' : id ? 'PUT' : 'POST', remove?.id ?? id, remove ? undefined : form);
      setPeople(result.people); setEditing(false); setRemoving(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save resource person.'); }
    finally { setBusy(false); }
  }
  async function attach(file?: File) {
    if (!file) return;
    if (!file.size || file.size > 5 * 1024 * 1024 || !/\.(pdf|docx?|txt|png|jpe?g)$/i.test(file.name)) { setError('Select a PDF, Word, text, PNG, or JPEG file up to 5 MB.'); setFileKey((key) => key + 1); return; }
    setBusy(true); setError('');
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Unable to read file.')); reader.readAsDataURL(file); });
      setForm((current) => ({ ...current, profile: { name: file.name, base64: data } })); setProfileName(file.name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to read profile.'); }
    finally { setBusy(false); }
  }
  async function download(person: TrainingResourcePerson) {
    if (!token) return;
    setBusy(true); setError('');
    try {
      const result = await fetchResourcePersonProfile(token, person.id);
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = url; link.download = result.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download profile.'); }
    finally { setBusy(false); }
  }
  const fields = [['lastName', 'Last Name', 150], ['firstName', 'First Name', 150], ['middleName', 'Middle Name', 150], ['company', 'Company', 500], ['email', 'Email', 320], ['contactNumber', 'Contact Number', 100], ['affiliation', 'Affiliation', 1000]] as const;
  const content = <>
    {error && <div role="alert" className="mb-3 text-sm text-red-600">{error}{!editing && <Button variant="outline" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div>}
    {loading ? <p role="status">Loading resource persons…</p> : editing ? <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {fields.map(([key, label, max]) => <div key={key}><Label htmlFor={`resource-${key}`} required={key === 'lastName' || key === 'firstName'}>{label}</Label><Input id={`resource-${key}`} type={key === 'email' ? 'email' : key === 'contactNumber' ? 'tel' : 'text'} required={key === 'lastName' || key === 'firstName'} maxLength={max} disabled={busy} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}
      <div><Label htmlFor="resource-full-name">Full Name (automatic)</Label><Input id="resource-full-name" readOnly value={[form.lastName.trim(), [form.firstName.trim(), form.middleName.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ')} /></div>
      <div className="sm:col-span-2"><Label htmlFor="resource-specializations">Specializations</Label><Textarea id="resource-specializations" maxLength={2000} disabled={busy} value={form.specializations} onChange={(event) => setForm({ ...form, specializations: event.target.value })} /></div>
      <div className="sm:col-span-2"><Label htmlFor="resource-profile">Short Profile Attachment</Label><Input key={fileKey} id="resource-profile" type="file" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" disabled={busy} onChange={(event) => void attach(event.target.files?.[0])} /><p className="mt-1 text-xs text-slate-500">PDF, Word, text, PNG, or JPEG. Maximum 5 MB. {profileName ? `Attached: ${profileName}` : 'No file attached.'}</p>{profileName && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setForm({ ...form, profile: null }); setProfileName(null); setFileKey((key) => key + 1); }}>Remove Attachment</Button>}</div>
      <div className="flex gap-2 sm:col-span-2"><Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save Resource Person'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button></div>
    </form> : <>
      <div className="mb-4 flex gap-2"><Input aria-label="Search resource persons" placeholder="Search name, company, specialization…" value={query} onChange={(event) => setQuery(event.target.value)} /><Button disabled={busy} onClick={() => edit()}>Add Resource Person</Button></div>
      {removing && <div className="mb-3 rounded border p-3 text-sm">Remove {removing.fullName} from the directory?<div className="mt-2 flex gap-2"><Button disabled={busy} variant="destructive" onClick={() => void save(removing)}>Remove</Button><Button disabled={busy} variant="outline" onClick={() => setRemoving(null)}>Cancel</Button></div></div>}
      <div className="max-h-96 space-y-3 overflow-auto">{people.filter((person) => `${person.fullName} ${person.company} ${person.specializations} ${person.affiliation}`.toLowerCase().includes(query.toLowerCase())).map((person) => <div key={person.id} className="rounded border border-slate-200 p-3"><p className="font-semibold">{person.fullName}</p><p className="text-sm text-slate-500">{[person.company, person.affiliation].filter(Boolean).join(' · ')}</p><p className="whitespace-pre-wrap text-sm">{person.specializations}</p><p className="text-sm text-slate-500">{[person.email, person.contactNumber].filter(Boolean).join(' · ')}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => edit(person)}>Edit</Button>{onUse && <Button size="sm" variant="outline" disabled={busy} onClick={() => onUse(person)}>Use for Conducted By</Button>}{person.profileName && <Button size="sm" variant="outline" disabled={busy} onClick={() => void download(person)}>Download Short Profile</Button>}<Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(person)}>Remove</Button></div></div>)}</div>
      {!people.length && <p className="py-6 text-sm text-slate-500">No resource persons yet. Add the first one above.</p>}
    </>}
  </>;
  return embedded ? <Card><CardHeader><CardTitle>Resource Speaker</CardTitle><p className="mt-1 text-sm text-slate-500">Manage resource persons and their short profiles.</p></CardHeader><CardContent>{content}</CardContent></Card> : <Dialog open title="Manage Resource Person" size="xl" onClose={() => { if (!busy) onClose(); }} footer={<Button variant="outline" disabled={busy} onClick={onClose}>Done</Button>}>{content}</Dialog>;
}
