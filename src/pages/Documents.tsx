import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { useAuth } from '@/context/AuthContext';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { fetchPolicyRecords } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { PolicyRecord } from '@/lib/types';

const STATUS_STYLES: Record<string, string> = {
  Effective: 'border-green-200 bg-green-50 text-green-700',
  'New (Draft)': 'border-gold-200 bg-gold-50 text-gold-800',
  'Amended (Draft)': 'border-orange-200 bg-orange-50 text-orange-700',
  Amended: 'border-brand-200 bg-brand-50 text-brand-700',
  Rescinded: 'border-red-200 bg-red-50 text-red-700',
};

function parseSearchTerms(query: string) {
  const terms: string[] = [];
  const matcher = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(query)) !== null) {
    const term = (match[1] ?? match[2]).trim().toLowerCase();
    if (term && !terms.includes(term)) terms.push(term);
  }

  return terms;
}

function matchesPolicySearch(record: PolicyRecord, query: string) {
  const terms = parseSearchTerms(query);
  if (terms.length === 0) return true;

  const searchableText = [
    record.title,
    record.documentNumber,
    record.documentType,
    record.revisionNumber,
    record.nature,
    record.status,
    record.contents,
  ].filter(Boolean).join(' ').toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

function makeContentSnippet(contents: string | null | undefined, query: string) {
  const terms = parseSearchTerms(query);
  const normalized = contents?.replace(/\s+/g, ' ').trim();
  if (!normalized || terms.length === 0) return '';

  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const candidates = sentences.map((sentence, index) => {
    const lowerSentence = sentence.toLowerCase();
    const matchedTerms = terms.filter((term) => lowerSentence.includes(term));
    return { sentence, index, matchedTerms };
  }).filter((candidate) => candidate.matchedTerms.length > 0);

  if (candidates.length === 0) return '';

  const uncovered = new Set(terms);
  const selected: typeof candidates = [];
  const remaining = [...candidates];

  while (remaining.length > 0 && selected.length < 2 && uncovered.size > 0) {
    remaining.sort((left, right) => {
      const leftScore = left.matchedTerms.filter((term) => uncovered.has(term)).length;
      const rightScore = right.matchedTerms.filter((term) => uncovered.has(term)).length;
      return rightScore - leftScore || right.matchedTerms.length - left.matchedTerms.length || left.index - right.index;
    });
    const best = remaining.shift();
    if (!best) break;
    selected.push(best);
    best.matchedTerms.forEach((term) => uncovered.delete(term));
  }

  const snippet = selected
    .sort((left, right) => left.index - right.index)
    .map(({ sentence }) => sentence.length > 220 ? `${sentence.slice(0, 217).trim()}…` : sentence)
    .join(' … ');

  return snippet.length > 440 ? `${snippet.slice(0, 437).trim()}…` : snippet;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function SearchSnippet({ contents, query }: { contents?: string | null; query: string }) {
  const snippet = makeContentSnippet(contents, query);
  const terms = parseSearchTerms(query);
  if (!snippet || terms.length === 0) return null;

  const matcher = new RegExp(`(${[...terms].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`, 'gi');
  const normalizedTerms = new Set(terms);

  return (
    <p className="mt-1 max-w-xl text-xs font-normal leading-5 text-slate-500">
      {snippet.split(matcher).map((part, index) => normalizedTerms.has(part.toLowerCase()) ? (
        <mark key={`${part}-${index}`} className="rounded bg-gold-100 px-0.5 text-gold-900">{part}</mark>
      ) : part)}
    </p>
  );
}

export default function Documents() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState<PolicyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documentType, setDocumentType] = useState('All');
  const [nature, setNature] = useState('All');
  const [status, setStatus] = useState('All');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchPolicyRecords(token)
      .then((nextRecords) => {
        if (!cancelled) setRecords(nextRecords);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError instanceof Error ? fetchError.message : 'Unable to load policy records.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const documentTypes = useMemo(() => Array.from(new Set(records.map((record) => record.documentType))).sort(), [records]);
  const natures = useMemo(() => Array.from(new Set(records.map((record) => record.nature))).sort(), [records]);
  const statuses = useMemo(() => Array.from(new Set(records.map((record) => record.status))).sort(), [records]);

  const filteredBase = records.filter((record) => {
    if (documentType !== 'All' && record.documentType !== documentType) return false;
    if (nature !== 'All' && record.nature !== nature) return false;
    if (status !== 'All' && record.status !== status) return false;
    return true;
  });

  const { search, setSearch, sortKey, sortDir, toggleSort, page, setPage, pageCount, pageRows, filteredCount } = useTableControls(
    filteredBase,
    matchesPolicySearch,
    10,
  );

  const searchTerms = useMemo(() => parseSearchTerms(search), [search]);

  const columns: Column<PolicyRecord>[] = [
    {
      key: 'title', header: 'Title', sortable: true, render: (record) => (
        <div className="min-w-[280px]">
          <span className="flex items-center gap-1.5 font-medium text-slate-800">
            <FileText className="h-3.5 w-3.5 shrink-0 text-brand-500" /> {record.title}
          </span>
          <SearchSnippet contents={record.contents} query={search} />
        </div>
      ),
    },
    { key: 'documentNumber', header: 'Document No.', sortable: true, render: (record) => <span className="font-mono text-xs">{record.documentNumber}</span> },
    { key: 'documentType', header: 'Type', render: (record) => <Badge>{record.documentType}</Badge> },
    { key: 'revisionNumber', header: 'Revision', render: (record) => record.revisionNumber, hideOnCard: true },
    { key: 'nature', header: 'Nature', render: (record) => record.nature },
    { key: 'effectivityDate', header: 'Effectivity', sortable: true, render: (record) => formatDate(record.effectivityDate), hideOnCard: true },
    { key: 'status', header: 'Status', render: (record) => <Badge className={STATUS_STYLES[record.status]}>{record.status}</Badge> },
    { key: 'attachmentName', header: 'Attachment', render: (record) => record.attachmentName ?? '—', hideOnCard: true },
  ];

  return (
    <div>
      <PageHeader
        title="Documents and Policies"
        description="Search the controlled policies, issuances, and guidelines maintained in the Policies and Issuances workspace."
        crumbs={[{ label: 'Documents and Policies' }]}
      />

      <Card>
        <CardContent className="pt-5">
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search title, document number, nature, or contents…"
            onExport={() => exportToCsv(
              'policy-records.csv',
              ['Title', 'Document No.', 'Type', 'Revision', 'Nature', 'Effectivity', 'Status', 'Attachment'],
              filteredBase.map((record) => [record.title, record.documentNumber, record.documentType, record.revisionNumber, record.nature, record.effectivityDate, record.status, record.attachmentName ?? '']),
            )}
            onPrint={() => window.print()}
          >
            <Select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="w-auto" aria-label="Filter by document type">
              <option value="All">All Document Types</option>
              {documentTypes.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Select value={nature} onChange={(event) => setNature(event.target.value)} className="w-auto" aria-label="Filter by nature">
              <option value="All">All Natures</option>
              {natures.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} className="w-auto" aria-label="Filter by policy status">
              <option value="All">All Statuses</option>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Toolbar>

          {searchTerms.length > 0 && (
            <p className="mb-4 text-xs text-slate-500">
              Searching policy metadata and contents for {searchTerms.length} {searchTerms.length === 1 ? 'term' : 'terms'}.
              {' '}All terms must match; use quotation marks for an exact phrase.
            </p>
          )}

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {loading ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">Loading policy records from Oracle…</div>
          ) : (
            <DataTable
              columns={columns}
              rows={pageRows}
              getRowId={(record) => record.id}
              onRowClick={(record) => navigate(`/documents/${encodeURIComponent(record.id)}`)}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              cardTitle={(record) => record.title}
              emptyTitle="No policy records found"
              emptyDescription="Add a record in My Workspace → Policies and Issuances, or adjust these filters."
            />
          )}
          {!loading && <Pagination page={page} pageCount={pageCount} onChange={setPage} total={filteredCount} pageSize={10} />}
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-slate-400">Records shown here come directly from the Oracle-backed Policies and Issuances register.</p>
    </div>
  );
}
