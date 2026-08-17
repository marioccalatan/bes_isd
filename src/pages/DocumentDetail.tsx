import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Download, Printer, Star, CheckCircle2, History } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canAccessDocument, accessExplanation } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import NotFound from './NotFound';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { documents } = useData();
  const { toast } = useToast();
  const { effectiveRole } = useRolePreview();
  const [favorite, setFavorite] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const doc = documents.find((d) => d.id === id);
  if (!doc) return <NotFound />;

  const accessible = canAccessDocument(doc.classification, effectiveRole);
  const related = documents.filter((d) => d.category === doc.category && d.id !== doc.id).slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={accessible ? doc.title : 'Restricted Document'} crumbs={[{ label: 'Documents and Policies', to: '/documents' }, { label: doc.id }]} actions={<Badge>{doc.category}</Badge>} />

      {!accessible ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Lock className="h-6 w-6" /></div>
            <p className="text-sm font-semibold text-slate-800">Access Restricted — {doc.classification}</p>
            <p className="max-w-sm text-sm text-slate-500">{accessExplanation(doc.classification)}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Detail label="Version" value={doc.version} />
              <Detail label="Owner" value={doc.owner} />
              <Detail label="Effectivity Date" value={formatDate(doc.effectivityDate)} />
              <Detail label="Review Date" value={formatDate(doc.reviewDate)} />
              <Detail label="Status" value={doc.status} />
              <Detail label="Classification" value={doc.classification} />
            </dl>
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Summary</p>
              <p className="text-sm text-slate-700">{doc.summary}</p>
            </div>

            {doc.requiresAcknowledgment && (
              <div className={`rounded-lg border p-3 ${acknowledged ? 'border-green-200 bg-green-50' : 'border-gold-200 bg-gold-50'}`}>
                {acknowledged ? (
                  <p className="flex items-center gap-2 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" /> Acknowledged.</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gold-900">This policy requires formal acknowledgment.</p>
                    <Button size="sm" onClick={() => { setAcknowledged(true); toast({ kind: 'success', title: 'Acknowledged' }); }}>Acknowledge</Button>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><History className="h-3.5 w-3.5" /> Version History</p>
              <ul className="space-y-1.5">
                {doc.versionHistory.map((v) => (
                  <li key={v.version} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
                    <span className="font-medium text-slate-700">v{v.version}</span>
                    <span className="text-slate-500">{v.note}</span>
                    <span className="text-xs text-slate-400">{formatDate(v.date)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {related.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Related Documents</p>
                <div className="flex flex-wrap gap-1.5">
                  {related.map((r) => <Badge key={r.id}>{r.title}</Badge>)}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 no-print">
              <Button variant="outline" size="sm" onClick={() => toast({ kind: 'info', title: 'Simulated download', description: `${doc.title}.pdf would download in production.` })}><Download className="h-4 w-4" /> Download</Button>
              <Button variant="outline" size="sm" onClick={() => setFavorite((f) => !f)}><Star className={`h-4 w-4 ${favorite ? 'fill-gold-500 text-gold-500' : ''}`} /> {favorite ? 'Favorited' : 'Favorite'}</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-700">{value}</dd>
    </div>
  );
}
