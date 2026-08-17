export interface SearchResult {
  id: string;
  type: 'Employee' | 'Department' | 'Service' | 'Request' | 'Memo' | 'Policy' | 'Event' | 'Module';
  title: string;
  subtitle: string;
  to: string;
}

export interface SearchIndexInput {
  employees: { id: string; name: string; position: string; departmentId: string; to: string }[];
  departments: { id: string; name: string; mandate: string; to: string }[];
  services: { id: string; name: string; description: string; to: string }[];
  requests: { id: string; title: string; status: string; to: string }[];
  news: { id: string; title: string; category: string; to: string }[];
  policies: { id: string; title: string; category: string; to: string }[];
  events: { id: string; title: string; layer: string; to: string }[];
  modules: { id: string; name: string; status: string; to: string }[];
}

export function buildSearchResults(input: SearchIndexInput, query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];

  input.employees.forEach((e) => {
    if (e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q)) {
      results.push({ id: e.id, type: 'Employee', title: e.name, subtitle: e.position, to: e.to });
    }
  });
  input.departments.forEach((d) => {
    if (d.name.toLowerCase().includes(q) || d.mandate.toLowerCase().includes(q)) {
      results.push({ id: d.id, type: 'Department', title: d.name, subtitle: 'Department', to: d.to });
    }
  });
  input.services.forEach((s) => {
    if (s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) {
      results.push({ id: s.id, type: 'Service', title: s.name, subtitle: s.description, to: s.to });
    }
  });
  input.requests.forEach((r) => {
    if (r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)) {
      results.push({ id: r.id, type: 'Request', title: r.title, subtitle: `${r.id} · ${r.status}`, to: r.to });
    }
  });
  input.news.forEach((n) => {
    if (n.title.toLowerCase().includes(q)) {
      results.push({ id: n.id, type: 'Memo', title: n.title, subtitle: n.category, to: n.to });
    }
  });
  input.policies.forEach((p) => {
    if (p.title.toLowerCase().includes(q)) {
      results.push({ id: p.id, type: 'Policy', title: p.title, subtitle: p.category, to: p.to });
    }
  });
  input.events.forEach((e) => {
    if (e.title.toLowerCase().includes(q)) {
      results.push({ id: e.id, type: 'Event', title: e.title, subtitle: e.layer, to: e.to });
    }
  });
  input.modules.forEach((m) => {
    if (m.name.toLowerCase().includes(q)) {
      results.push({ id: m.id, type: 'Module', title: m.name, subtitle: m.status, to: m.to });
    }
  });

  return results.slice(0, 60);
}
