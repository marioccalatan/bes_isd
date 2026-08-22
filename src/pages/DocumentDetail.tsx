import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileText, Printer, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { downloadPolicyRecordAttachment, fetchPolicyRecords } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { PolicyRecord } from '@/lib/types';
import NotFound from './NotFound';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();
  const [record, setRecord] = useState<PolicyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchPolicyRecords(token)
      .then((records) => {
        if (!cancelled) setRecord(records.find((item) => item.id === id) ?? null);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Unable to load this policy record.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, token]);

  async function downloadAttachment() {
    if (!record?.attachmentName) return;
    setDownloading(true);
    try {
      await downloadPolicyRecordAttachment(token, record.id, record.attachmentName);
    } catch (downloadError) {
      toast({ kind: 'error', title: 'Download failed', description: downloadError instanceof Error ? downloadError.message : 'Unable to download the attachment.' });
    } finally {
      setDownloading(false);
    }
  }

  function closeDocument() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/documents', { replace: true });
  }

  if (loading) {
    return <div className="rounded-xl border border-slate-200 py-16 text-center text-sm text-slate-500">Loading policy record from Oracle…</div>;
  }
  if (!record && !error) return <NotFound />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={record?.title ?? 'Policy record unavailable'}
        crumbs={[{ label: 'Documents and Policies', to: '/documents' }, { label: record?.documentNumber ?? id ?? 'Record' }]}
        actions={(
          <div className="flex items-center gap-2 no-print">
            {record && <Badge>{record.documentType}</Badge>}
            <Button variant="outline" size="sm" onClick={closeDocument} aria-label="Close document and go back">
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
        )}
      />

      {error || !record ? (
        <Card><CardContent className="py-12 text-center text-sm text-red-700">{error || 'Policy record not found.'}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><FileText className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{record.title}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{record.documentNumber}</p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Detail label="Document Type" value={record.documentType} />
              <Detail label="Revision" value={record.revisionNumber} />
              <Detail label="Effectivity Date" value={formatDate(record.effectivityDate)} />
              <Detail label="Nature" value={record.nature} />
              <Detail label="Status" value={record.status} />
              <Detail label="Created By" value={record.createdBy ?? '—'} />
            </dl>

            <div className="border-t border-slate-100 pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Contents</p>
              <PolicyContents contents={record.contents} />
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attachment</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{record.attachmentName ?? 'No DOCX attachment uploaded'}</p>
              {record.attachmentSize != null && <p className="mt-0.5 text-xs text-slate-400">{formatFileSize(record.attachmentSize)}</p>}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 no-print">
              <Button variant="outline" size="sm" disabled={!record.attachmentName || downloading} onClick={downloadAttachment}>
                <Download className="h-4 w-4" /> {downloading ? 'Downloading…' : 'Download DOCX'}
              </Button>
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

const POLICY_SECTION_PATTERN = /\b(PURPOSE|INTRODUCTION|SCOPE|OBJECTIVES?|DEFINITIONS?|POLICIES|POLICY STATEMENT|GUIDELINES|PROCEDURES|IMPLEMENTATION|RESPONSIBILITIES|EFFECTIVITY|APPROVAL|REFERENCES|SIGNED|APPROVED)\s*:/gi;

function PolicyContents({ contents }: { contents: string }) {
  const normalized = contents
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sections: Array<{ heading?: string; body: string }> = [];
  let cursor = 0;
  let heading: string | undefined;
  let match: RegExpExecArray | null;
  POLICY_SECTION_PATTERN.lastIndex = 0;

  while ((match = POLICY_SECTION_PATTERN.exec(normalized)) !== null) {
    const body = normalized.slice(cursor, match.index).trim();
    if (body) sections.push({ heading, body });
    heading = titleCase(match[1]);
    cursor = POLICY_SECTION_PATTERN.lastIndex;
  }

  const remaining = normalized.slice(cursor).trim();
  if (remaining) sections.push({ heading, body: remaining });
  if (sections.length === 0 && normalized) sections.push({ body: normalized });

  return (
    <div className="space-y-4 text-sm leading-7 text-slate-700">
      {sections.map((section, sectionIndex) => (
        <section key={`${section.heading ?? 'contents'}-${sectionIndex}`} className="space-y-2">
          {section.heading && <h3 className="font-semibold uppercase tracking-wide text-slate-900">{section.heading}</h3>}
          {policyParagraphs(section.heading, section.body).map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex} className="whitespace-pre-line text-justify">{paragraph.trim()}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function policyParagraphs(heading: string | undefined, body: string) {
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!heading || !/^(Policies|Guidelines|Procedures)$/.test(heading)) return paragraphs;
  return paragraphs.flatMap((paragraph) => paragraph.split(/\s+(?=\d+\.\s)/).map((item) => item.trim()).filter(Boolean));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
