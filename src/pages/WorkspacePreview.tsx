import { useParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DepartmentWorkspaceContent } from '@/components/shared/DepartmentWorkspaceContent';
import { useData } from '@/context/DataContext';
import { findDeptPreview } from '@/lib/deptPreviews';
import NotFound from './NotFound';

export default function WorkspacePreview() {
  const { deptId } = useParams<{ deptId: string }>();
  const { departments } = useData();
  const dept = departments.find((d) => d.id === deptId);
  const preview = findDeptPreview(deptId ?? '');
  if (!dept || !preview) return <NotFound />;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-medium text-gold-800">
        <Eye className="h-3.5 w-3.5 shrink-0" /> Demo-Role Preview — showing a simulated view of the {dept.name} workspace for presentation purposes.
      </div>
      <PageHeader title={`${dept.name} — Workspace Preview`} description={dept.mandate} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: `Preview: ${dept.shortName}` }]} />
      <DepartmentWorkspaceContent deptId={dept.id} />
    </div>
  );
}
