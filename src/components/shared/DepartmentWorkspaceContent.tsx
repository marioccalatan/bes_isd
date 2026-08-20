import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { findDeptPreview } from '@/lib/deptPreviews';
import { getToolIcon } from '@/lib/toolIcons';
import { cn, formatDate } from '@/lib/utils';
import type { AppTool, DepartmentId, ToolAccessLevel } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';
import { canAccessTool } from '@/lib/toolAccess';
import { useToast } from '@/context/ToastContext';

const STATUS_STYLES: Record<string, string> = {
  Active: 'border-brand-200 bg-brand-50 text-brand-700',
  Pending: 'border-gold-200 bg-gold-50 text-gold-800',
  Completed: 'border-green-200 bg-green-50 text-green-700',
  Ongoing: 'border-brand-200 bg-brand-50 text-brand-700',
  Scheduled: 'border-slate-200 bg-slate-100 text-slate-600',
};

const SYSTEM_BADGE_STYLES: Record<ToolAccessLevel, string> = {
  ADMIN: 'bg-white/15 text-white',
  NEW: 'bg-gold-400/90 text-brand-950',
  VIEW: 'bg-white/15 text-white',
  EDIT: 'bg-white/15 text-white',
  OPEN: 'bg-white/15 text-white',
  SOON: 'bg-black/20 text-white/70',
  EXISTING: 'bg-black/20 text-white/70',
};

const SYSTEM_BADGE_LABELS: Partial<Record<ToolAccessLevel, string>> = {
  EXISTING: 'Existing System',
};

export function SystemsPortal({ deptShortName, tools, deptId }: { deptShortName: string; tools: AppTool[]; deptId: DepartmentId }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <Card className="mb-5 overflow-hidden">
      <CardHeader>
        <CardTitle>{deptShortName} Application Portal</CardTitle>
        <p className="text-xs text-slate-500">Systems and tools available to this department. Select a tile to open.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tools.map((t) => {
            const grant = t.access.find((a) => a.departmentId === deptId);
            if (!grant) return null;
            const status = t.status ?? 'ENABLED';
            const disabled = status === 'SOON' || grant.level === 'EXISTING';
            const Icon = getToolIcon(t.iconKey);
            const description = grant.note ?? t.name;
            return (
              <button
                key={t.code}
                disabled={disabled}
                title={status === 'SOON' ? t.description : undefined}
                onClick={() => status === 'DISABLED' ? toast({ kind: 'warning', title: 'Temporarily Disabled', description: t.description }) : navigate(`/workspace/preview/${deptId}/tools/${encodeURIComponent(t.code)}`)}
                className={cn(
                  'group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#0f6b3d] to-[#04331a] p-3.5 text-left shadow-sm transition-transform',
                  disabled ? 'cursor-not-allowed opacity-60' : 'hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400'
                )}
              >
                <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide', SYSTEM_BADGE_STYLES[grant.level])}>
                  {status === 'SOON' ? 'SOON' : SYSTEM_BADGE_LABELS[grant.level] ?? grant.level}
                </span>
                <Icon className="h-6 w-6 text-white/90" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-bold leading-tight text-white">{t.code}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-white/70">{description}</span>
                </span>
                {t.access.length > 1 && (
                  <span className="text-[10px] text-white/50">Shared with {t.access.length - 1} other department{t.access.length - 1 === 1 ? '' : 's'}</span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DepartmentWorkspaceContent({ deptId }: { deptId: DepartmentId }) {
  const { user } = useAuth();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewOffice, previewPosition } = useRolePreview();
  const { tools } = useData();
  const preview = findDeptPreview(deptId);
  if (!preview) return null;

  const canSeeRestricted = effectiveRole === 'Auditor' || effectiveRole === 'Board Member';
  const deptTools = tools.filter((tool) => tool.access.some((grant) => grant.departmentId === deptId) && canAccessTool(tool, {
    role: effectiveRole,
    departmentCode: previewDepartmentId ?? user?.departmentCode,
    officeName: isPreviewing ? previewOffice : user?.unitName,
    positionTitle: isPreviewing ? previewPosition : user?.position,
  }));

  return (
    <div>
      {deptTools.length > 0 && (
        <SystemsPortal deptShortName={deptId} tools={deptTools} deptId={deptId} />
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {preview.kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{k.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle>Work Queue</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {preview.workQueue.map((r) => {
                const locked = r.restricted && !canSeeRestricted;
                return (
                  <div key={r.id} className={`rounded-lg border p-3 ${locked ? 'border-slate-200 bg-slate-50' : 'border-slate-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${locked ? 'text-slate-400' : 'text-slate-800'}`}>
                          {locked ? 'Restricted Audit Record' : r.title}
                        </p>
                        <p className="text-xs text-slate-400">{r.subtitle}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge>{r.tag}</Badge>
                        <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                      </div>
                    </div>
                    {locked ? (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <Lock className="h-3.5 w-3.5" /> Restricted — visible only to Auditor or Board Member role preview.
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">{r.description}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">{formatDate(r.date)}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Module Shortcuts</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {preview.modules.map((m) => <Badge key={m} className="border-brand-200 bg-brand-50 text-brand-700">{m}</Badge>)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Activities</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {preview.activities.map((a) => (
                <div key={a.title}>
                  <p className="text-sm font-medium text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-400">{formatDate(a.date)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{a.detail}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
