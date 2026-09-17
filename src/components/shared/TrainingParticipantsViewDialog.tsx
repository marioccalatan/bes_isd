import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchTrainingParticipants, type TrainingParticipant, type TrainingSeminar } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function TrainingParticipantsViewDialog({ training, onClose, onAdd }: { training: TrainingSeminar; onClose: () => void; onAdd: () => void }) {
  const { token } = useAuth();
  const [participants, setParticipants] = useState<TrainingParticipant[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    if (!token) { setLoading(false); setError('Sign in to view participants.'); return; }
    fetchTrainingParticipants(token, training.id)
      .then((result) => { if (!cancelled) setParticipants(result.participants); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load participants.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, training.id, attempt]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = participants.filter((person) => terms.every((term) => `${person.name} ${person.employeeNo} ${person.employmentStatus ?? ''}`.toLowerCase().includes(term)));
  return <Dialog open onClose={onClose} title="Training Participants" description={`${training.name}${training.dateFrom ? ` · ${formatDate(training.dateFrom)}` : ''}`} size="lg" footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={onAdd}>Add Participant</Button></>}>
    {loading ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading participants…</p> : error ? <div role="alert" className="space-y-3"><p className="text-sm text-red-600">{error}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : <div className="space-y-3">
      <Input aria-label="Search participants" placeholder="Search name, employee number, or employment status…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <p className="text-xs text-slate-500">{visible.length} of {participants.length} participants · Includes inactive employees.</p>
      <div className="max-h-96 overflow-auto rounded-md border border-slate-200"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-surface text-xs text-slate-500"><tr><th scope="col" className="px-3 py-2">Employee No.</th><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">Employment Status</th></tr></thead><tbody className="divide-y divide-slate-100">
        {visible.map((person) => <tr key={person.employeeNo}><td className="px-3 py-2 text-slate-600">{person.employeeNo}</td><td className="px-3 py-2 font-medium text-slate-800">{person.name}</td><td className="px-3 py-2 text-xs text-slate-500">{person.employmentStatus || 'Unavailable'}</td></tr>)}
        {!visible.length && <tr><td colSpan={3} className="p-8 text-center text-slate-500">{participants.length ? 'No participants match your search.' : 'No participants added yet.'}</td></tr>}
      </tbody></table></div>
    </div>}
  </Dialog>;
}
