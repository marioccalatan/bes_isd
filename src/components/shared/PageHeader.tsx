import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, description, crumbs, actions }: { title: string; description?: string; crumbs?: Crumb[]; actions?: ReactNode }) {
  return (
    <div className="mb-5">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-slate-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden="true" />}
              {c.to ? (
                <Link to={c.to} className="hover:text-brand-600 hover:underline">{c.label}</Link>
              ) : (
                <span aria-current="page" className="font-medium text-slate-700">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
