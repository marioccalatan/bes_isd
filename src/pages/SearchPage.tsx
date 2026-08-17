import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { useData } from '@/context/DataContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { buildSearchResults, type SearchResult } from '@/lib/search';
import { SERVICES } from '@/lib/services';

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const navigate = useNavigate();
  const data = useData();

  const results: SearchResult[] = useMemo(() => {
    return buildSearchResults(
      {
        employees: data.employees.map((e) => ({ id: e.id, name: e.name, position: e.position, departmentId: e.departmentId, to: `/organization/employee/${e.id}` })),
        departments: data.departments.map((d) => ({ id: d.id, name: d.name, mandate: d.mandate, to: `/organization/${d.id}` })),
        services: SERVICES.map((s) => ({ id: s.id, name: s.name, description: s.description, to: s.to })),
        requests: data.workItems.filter((w) => w.requestorId === CURRENT_EMPLOYEE.id).map((w) => ({ id: w.id, title: w.title, status: w.status, to: `/my-work/${w.id}` })),
        news: data.news.map((n) => ({ id: n.id, title: n.title, category: n.category, to: `/news/${n.id}` })),
        policies: data.documents.map((p) => ({ id: p.id, title: p.title, category: p.category, to: `/documents/${p.id}` })),
        events: data.events.map((e) => ({ id: e.id, title: e.title, layer: e.layer, to: `/calendar` })),
        modules: data.modules.map((m) => ({ id: m.id, name: m.name, status: m.status, to: `/workspace/governance` })),
      },
      query
    );
  }, [query, data]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search Results" crumbs={[{ label: 'Search' }]} />
      <div className="relative mb-6">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchParams({ q: e.target.value }); }}
          placeholder="Search employees, departments, services, requests, memos, policies, events, modules…"
          className="pl-9"
          aria-label="Search"
          autoFocus
        />
      </div>

      {!query.trim() ? (
        <EmptyState title="Start typing to search" description="Search across employees, departments, services, requests, memos, policies, events, and BES modules." />
      ) : results.length === 0 ? (
        <EmptyState title={`No results for "${query}"`} description="Try a different search term." />
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{type} ({items.length})</h2>
              <div className="space-y-1.5">
                {items.map((r) => (
                  <Card key={`${r.type}-${r.id}`} role="button" tabIndex={0} onClick={() => navigate(r.to)} onKeyDown={(e) => e.key === 'Enter' && navigate(r.to)} className="flex cursor-pointer items-center justify-between gap-2 p-3 hover:shadow-md">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{r.title}</p>
                      <p className="truncate text-xs text-slate-500">{r.subtitle}</p>
                    </div>
                    <Badge>{r.type}</Badge>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
