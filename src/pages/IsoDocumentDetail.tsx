import { useParams, useNavigate } from 'react-router-dom';
import { Download, Printer, BookOpen, ListChecks, Workflow, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FlowchartCanvas } from '@/components/shared/FlowchartCanvas';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/lib/utils';
import NotFound from './NotFound';

export default function IsoDocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { qmsDocuments } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const doc = qmsDocuments.find((d) => d.id === id);
  if (!doc) return <NotFound />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={doc.title}
        crumbs={[{ label: 'ISO / QMS', to: '/iso' }, { label: doc.code }]}
        actions={<Badge className="border-brand-200 bg-brand-50 text-brand-700">{doc.type}</Badge>}
      />

      <Card>
        <CardContent className="space-y-5 pt-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Detail label="Doc. No." value={doc.code} mono />
            <Detail label="Department" value={doc.departmentId} />
            <Detail label="Revision No." value={doc.revisionNo} />
            <Detail label="Effective Date" value={formatDate(doc.effectiveDate)} />
            <Detail label="Pages" value={String(doc.pageCount)} />
            <Detail label="Status" value={doc.status} />
          </dl>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">1.0 Objective</p>
            <p className="text-sm text-slate-700">{doc.objective}</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">2.0 Scope</p>
            <p className="text-sm text-slate-700">{doc.scope}</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Workflow className="h-3.5 w-3.5" /> 4.0 Procedure Flowchart</p>
              <Button variant="outline" size="sm" onClick={() => navigate(`/iso/${doc.id}/flowchart`)} className="no-print"><Pencil className="h-3.5 w-3.5" /> Edit Flowchart</Button>
            </div>
            <FlowchartCanvas flowchart={doc.flowchart} height="420px" />
          </div>

          {doc.definitions.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><BookOpen className="h-3.5 w-3.5" /> 3.0 Definitions</p>
              <dl className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {doc.definitions.map((d) => (
                  <div key={d.term} className="flex flex-col gap-0.5 p-2.5 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 font-mono text-xs font-semibold text-brand-700 sm:w-24">{d.term}</dt>
                    <dd className="text-sm text-slate-600">{d.meaning}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {doc.referenceRecords.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><ListChecks className="h-3.5 w-3.5" /> Reference and Records</p>
              <ul className="space-y-1">
                {doc.referenceRecords.map((r) => (
                  <li key={r} className="rounded-lg border border-slate-100 p-2 text-sm text-slate-600">{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sign-off</p>
            <div className="grid grid-cols-1 divide-y divide-slate-100 rounded-lg border border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <SignOff label="Prepared By" name={doc.preparedByName} position={doc.preparedByPosition} />
              <SignOff label="Reviewed and Approved By" name={doc.approvedByName} position={doc.approvedByPosition} />
              <SignOff label="Noted By" name={doc.notedByName} position={doc.notedByPosition} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 no-print">
            <Button variant="outline" size="sm" onClick={() => toast({ kind: 'info', title: 'Simulated download', description: `${doc.code}.pdf would download in production.` })}><Download className="h-4 w-4" /> Download</Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 font-medium text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function SignOff({ label, name, position }: { label: string; name: string; position: string }) {
  return (
    <div className="p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-800">{name}</p>
      <p className="text-xs text-slate-500">{position}</p>
    </div>
  );
}
