import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Bookmark, Download, Printer, CheckCircle2, Paperclip } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, PriorityBadge } from '@/components/ui/badge';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canSeeAdministration } from '@/lib/permissions';
import { formatDate } from '@/lib/utils';
import NotFound from './NotFound';

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const { news, newsReadStates, markNewsRead, toggleBookmark, acknowledgeNews } = useData();
  const { toast } = useToast();
  const { effectiveRole } = useRolePreview();
  const post = news.find((p) => p.id === id);
  const state = newsReadStates.find((r) => r.postId === id);

  useEffect(() => {
    if (post && !state?.read) markNewsRead(post.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  if (!post) return <NotFound />;

  const canSeeAckCount = canSeeAdministration(effectiveRole);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={post.title}
        crumbs={[{ label: 'News and Memos', to: '/news' }, { label: post.title }]}
        actions={
          <>
            <Badge>{post.category}</Badge>
            <PriorityBadge priority={post.priority} />
          </>
        }
      />
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-sm text-slate-500">
            <span>{post.issuingOffice} · {formatDate(post.date)}</span>
            <span>Recipients: {post.recipients}</span>
          </div>

          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{post.body}</p>

          {post.hasAttachment && (
            <button onClick={() => toast({ kind: 'info', title: 'Simulated download', description: `${post.attachmentName} would download in production.` })} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm text-brand-600 hover:bg-slate-50">
              <Paperclip className="h-4 w-4" /> {post.attachmentName}
              <Download className="ml-auto h-4 w-4" />
            </button>
          )}

          {post.requiresAcknowledgment && (
            <div className={`rounded-lg border p-3 ${state?.acknowledged ? 'border-green-200 bg-green-50' : 'border-gold-200 bg-gold-50'}`}>
              {state?.acknowledged ? (
                <p className="flex items-center gap-2 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" /> You acknowledged this on {formatDate(state.acknowledgedAt)}.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gold-900">This post requires formal acknowledgment.</p>
                  <Button size="sm" onClick={() => { acknowledgeNews(post.id); toast({ kind: 'success', title: 'Acknowledged', description: 'Your acknowledgment has been recorded.' }); }}>
                    <CheckCircle2 className="h-4 w-4" /> Acknowledge
                  </Button>
                </div>
              )}
            </div>
          )}

          {canSeeAckCount && post.requiresAcknowledgment && (
            <p className="text-xs text-slate-400">Acknowledgment tracking (authorized view): approximately 68% of intended recipients have acknowledged this post as of today — simulated figure for demonstration.</p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 no-print">
            <Button variant="outline" size="sm" onClick={() => toggleBookmark(post.id)}>
              <Bookmark className={`h-4 w-4 ${state?.bookmarked ? 'fill-gold-500 text-gold-500' : ''}`} /> {state?.bookmarked ? 'Bookmarked' : 'Bookmark'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
