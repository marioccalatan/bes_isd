import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { SERVICES, type ServiceDef } from '@/lib/services';
import { EmptyState } from '@/components/ui/empty-state';

const CATEGORIES = ['Time & Pay', 'Leave & Travel', 'Personnel Documents', 'Institutional Support'] as const;

export default function ServicesCatalog() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const filtered: ServiceDef[] = useMemo(() => {
    if (!query.trim()) return SERVICES;
    const q = query.toLowerCase();
    return SERVICES.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <div>
      <PageHeader title="Employee Services" description="A catalog of self-service actions available to every BENECO employee." crumbs={[{ label: 'Employee Services' }]} />
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services…" className="pl-9" aria-label="Search services" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No services found" description="Try a different search term." />
      ) : (
        CATEGORIES.map((cat) => {
          const items = filtered.filter((s) => s.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-7">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">{cat}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((s) => (
                  <Card
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(s.to)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(s.to)}
                    className="flex cursor-pointer flex-col gap-2 p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{s.description}</p>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
