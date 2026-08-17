import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { FlowchartCanvas } from '@/components/shared/FlowchartCanvas';
import { Card, CardContent } from '@/components/ui/card';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import type { QmsFlowchart } from '@/lib/types';
import NotFound from './NotFound';

export default function IsoFlowchartBuilder() {
  const { id } = useParams<{ id: string }>();
  const { qmsDocuments, updateQmsFlowchart } = useData();
  const { toast } = useToast();
  const navigate = useNavigate();
  const doc = qmsDocuments.find((d) => d.id === id);
  if (!doc) return <NotFound />;

  function handleSave(flowchart: QmsFlowchart) {
    updateQmsFlowchart(doc!.id, flowchart);
    toast({ kind: 'success', title: 'Flowchart saved', description: `${doc!.code} — Section 4.0 updated.` });
    navigate(`/iso/${doc!.id}`);
  }

  return (
    <div>
      <PageHeader
        title={`Flowchart Builder — ${doc.code}`}
        description={doc.title}
        crumbs={[{ label: 'ISO / QMS', to: '/iso' }, { label: doc.code, to: `/iso/${doc.id}` }, { label: 'Flowchart Builder' }]}
      />
      <Card>
        <CardContent className="pt-5">
          <FlowchartCanvas flowchart={doc.flowchart} editable onSave={handleSave} height="calc(100vh - 320px)" />
        </CardContent>
      </Card>
    </div>
  );
}
