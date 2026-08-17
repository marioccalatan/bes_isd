import { useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { RequestForm } from '@/components/shared/RequestForm';
import { PROCESS_DEFS } from '@/lib/processDefs';
import type { ProcessType } from '@/lib/types';
import { useData } from '@/context/DataContext';
import NotFound from './NotFound';

export default function RequestNew() {
  const { processType } = useParams<{ processType: string }>();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const { workItems } = useData();
  const def = PROCESS_DEFS[processType as ProcessType];
  if (!def) return <NotFound />;

  const existingDraft = editId ? workItems.find((w) => w.id === editId) : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={existingDraft ? `Edit: ${def.title}` : `File: ${def.title}`}
        description={def.summary}
        crumbs={[{ label: 'Employee Services', to: '/services' }, { label: def.title }]}
      />
      <RequestForm def={def} existingDraft={existingDraft} />
    </div>
  );
}
