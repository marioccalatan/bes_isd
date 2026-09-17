import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { manageTrainingCategories, type TrainingCategory } from '@/lib/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function TrainingCategoryManager({ onClose, onChange }: { onClose: () => void; onChange: (rows: TrainingCategory[]) => void }) {
  const { token } = useAuth();
  const [rows, setRows] = useState<TrainingCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [id, setId] = useState<string>();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<TrainingCategory | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setLoading(false); setError('Sign in to manage categories.'); return; }
    manageTrainingCategories(token).then((result) => { if (!cancelled) setRows(result.categories); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load categories.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, attempt]);
  async function save(remove?: TrainingCategory) {
    if (!token || saving) return;
    setSaving(true); setError('');
    try {
      const result = await manageTrainingCategories(token, remove ? 'DELETE' : id ? 'PUT' : 'POST', remove?.id ?? id, remove ? undefined : name);
      setRows(result.categories); onChange(result.categories); setName(''); setId(undefined); setDeleting(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save category.'); }
    finally { setSaving(false); }
  }
  return <Dialog open title="Manage Training Categories" description="Category IDs stay unchanged when names are edited. Categories in use cannot be deleted." size="lg" onClose={() => { if (!saving) onClose(); }} footer={<Button variant="outline" disabled={saving} onClick={onClose}>Done</Button>}>
    {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
    {loading ? <p role="status">Loading categories…</p> : <>
      <form className="mb-4 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}><Label htmlFor="category-name">{id ? `Edit Category #${id}` : 'New Category'}</Label><Input id="category-name" required maxLength={300} disabled={saving} value={name} onChange={(event) => setName(event.target.value)} /><div className="flex gap-2"><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : id ? 'Save Changes' : 'Add Category'}</Button>{id && <Button type="button" variant="outline" disabled={saving} onClick={() => { setId(undefined); setName(''); }}>Cancel Edit</Button>}</div></form>
      {deleting && <div className="mb-3 rounded border border-red-300 p-3 text-sm"><p>Delete “{deleting.name}” (ID {deleting.id})?</p><div className="mt-2 flex gap-2"><Button variant="destructive" disabled={saving} onClick={() => void save(deleting)}>Delete Category</Button><Button variant="outline" disabled={saving} onClick={() => setDeleting(null)}>Cancel</Button></div></div>}
      <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">ID</th><th className="p-2">Category</th><th className="p-2">Trainings</th><th className="p-2">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-200"><td className="p-2">{row.id}</td><td className="p-2">{row.name}</td><td className="p-2">{row.usageCount}</td><td className="p-2"><div className="flex gap-1"><Button size="sm" variant="outline" disabled={saving} onClick={() => { setId(row.id); setName(row.name); setDeleting(null); }}>Edit</Button><Button size="sm" variant="outline" disabled={saving || row.usageCount > 0} title={row.usageCount ? 'Category is used by trainings' : 'Delete category'} onClick={() => setDeleting(row)}>Delete</Button></div></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="mt-3 text-sm">No categories available.</p>}
      {error && <Button variant="outline" disabled={saving} onClick={() => setAttempt((value) => value + 1)}>Reload Categories</Button>}
    </>}
  </Dialog>;
}
