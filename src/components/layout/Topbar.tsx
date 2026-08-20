import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Menu, Search, Plus, Bell, HelpCircle, ChevronDown, LogOut, User, Eye,
  Info, PlayCircle, X as XIcon, Sun, Moon, Monitor, Palette, Check,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useData } from '@/context/DataContext';
import { useUI } from '@/context/UIContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useRolePreview, PREVIEWABLE_ROLES, DEPARTMENT_MANAGER_OPTIONS, ISD_PREVIEW_OPTIONS } from '@/context/RolePreviewContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import { buildSearchResults, type SearchResult } from '@/lib/search';
import { SERVICES } from '@/lib/services';
import { cn, initials, timeAgo } from '@/lib/utils';
import { canSeeAdministration } from '@/lib/permissions';
import type { AppRole } from '@/lib/types';
import { DropdownMenu, DropdownItem, DropdownSeparator, DropdownLabel } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export function Topbar({ onOpenDrawer }: { onOpenDrawer: () => void }) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const data = useData();
  const { setAboutOpen, startTour } = useUI();
  const { mode, resolvedTheme, accentTheme, accentThemes, setMode, setAccentTheme } = useTheme();
  const { effectiveRole, isPreviewing, previewDepartmentId, previewLabel, setPreviewRole, setPreviewDepartmentManager, setPreviewPersona, returnToAdministrator } = useRolePreview();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const results: SearchResult[] = useMemo(() => {
    if (!query.trim()) return [];
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

  const unreadCount = data.notifications.filter((n) => !n.read).length;
  const profileName = user?.name ?? CURRENT_EMPLOYEE.name;
  const profilePosition = user?.position ?? CURRENT_EMPLOYEE.position;
  const profileRole = user?.role ?? 'Administrator';
  const signedInAsAdministrator = canSeeAdministration(profileRole as AppRole) || (user?.roles ?? []).some((role) => role.startsWith('Administrator'));
  const showRolePreviewMenu = signedInAsAdministrator && !isPreviewing;
  const profilePhoto = user?.profilePhoto;

  function goTo(to: string) {
    setSearchOpen(false);
    setQuery('');
    navigate(to);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-surface px-3 shadow-sm sm:gap-3 sm:px-4 no-print">
      <button onClick={onOpenDrawer} aria-label="Open navigation menu" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden">
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative flex-1 max-w-md" ref={searchRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) goTo(`/search?q=${encodeURIComponent(query.trim())}`); }}
          placeholder="Search employees, requests, memos, policies…"
          aria-label="Global search"
          className="pl-9 pr-3"
        />
        {searchOpen && query.trim() && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-surface p-1.5 shadow-xl">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No results for "{query}".</p>
            ) : (
              <>
                {results.slice(0, 8).map((r) => (
                  <button key={`${r.type}-${r.id}`} onClick={() => goTo(r.to)} className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-slate-100">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <Badge className="border-brand-200 bg-brand-50 text-brand-700">{r.type}</Badge>
                      {r.title}
                    </span>
                    <span className="truncate text-xs text-slate-500">{r.subtitle}</span>
                  </button>
                ))}
                <button onClick={() => goTo(`/search?q=${encodeURIComponent(query.trim())}`)} className="mt-1 w-full rounded-md px-3 py-2 text-center text-xs font-semibold text-brand-600 hover:bg-brand-50">
                  View all {results.length} results
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="hidden shrink-0 text-sm text-slate-500 md:block">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>

      <DropdownMenu
        trigger={
          <button className="flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Quick Create</span>
          </button>
        }
      >
        {(close) => (
          <DropdownItem onClick={() => { close(); navigate('/calendar?new=1'); }}>
            <Plus className="h-4 w-4 text-slate-400" /> New Calendar Event
          </DropdownItem>
        )}
      </DropdownMenu>

      <DropdownMenu
        trigger={
          <button aria-label={`Notifications, ${unreadCount} unread`} className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        }
        className="w-80"
      >
        {(close) => (
          <>
            <DropdownLabel>Notifications</DropdownLabel>
            {data.notifications.slice(0, 5).map((n) => (
              <DropdownItem key={n.id} onClick={() => { close(); data.markNotificationRead(n.id); navigate('/notifications'); }}>
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">{n.title}</span>
                  <span className="block truncate text-xs text-slate-500">{timeAgo(n.timestamp)}</span>
                </span>
              </DropdownItem>
            ))}
            <DropdownSeparator />
            <DropdownItem onClick={() => { close(); navigate('/notifications'); }} className="justify-center font-semibold text-brand-600">
              View all notifications
            </DropdownItem>
          </>
        )}
      </DropdownMenu>

      <button
        onClick={() => setMode(resolvedTheme === 'dark' ? 'light' : 'dark')}
        aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
      >
        {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <button onClick={() => navigate('/help')} aria-label="Help and Support" className="hidden rounded-md p-2 text-slate-500 hover:bg-slate-100 sm:block">
        <HelpCircle className="h-5 w-5" />
      </button>

      <DropdownMenu
        trigger={
          <button className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-slate-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
              {profilePhoto ? <img src={profilePhoto} alt="" className="h-full w-full rounded-full object-cover" /> : initials(profileName)}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-xs font-semibold text-slate-800">{profileName}</span>
              <span className="block truncate text-[11px] text-slate-500">{isPreviewing ? `Viewing as ${previewLabel}` : `${profileRole} view`}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
          </button>
        }
        className="w-80"
      >
        {(close) => (
          <>
            <div className="flex items-center gap-3 px-2.5 py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {profilePhoto ? <img src={profilePhoto} alt="" className="h-full w-full rounded-full object-cover" /> : initials(profileName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{profileName}</p>
                <p className="truncate text-xs text-slate-500">{profilePosition}</p>
              </div>
            </div>
            <DropdownSeparator />
            <DropdownItem onClick={() => { close(); navigate('/profile'); }}>
              <User className="h-4 w-4 text-slate-400" /> View Profile
            </DropdownItem>
            {(showRolePreviewMenu || isPreviewing) && <DropdownSeparator />}
            {showRolePreviewMenu && (
              <>
                <DropdownLabel>View BES As (Role Preview)</DropdownLabel>
                <p className="px-2.5 pb-0.5 pt-1.5 text-xs font-medium text-slate-500">Institutional Services Department</p>
                {ISD_PREVIEW_OPTIONS.map((opt) => {
                  const active = effectiveRole === opt.role && previewDepartmentId === opt.departmentId && previewLabel.includes(opt.office);
                  return (
                    <DropdownItem
                      key={opt.id}
                      onClick={() => { close(); setPreviewPersona(opt.role, opt.departmentId, `${opt.role} — ${opt.office}`, opt.office, opt.position); }}
                      className={cn('pl-6', active ? 'bg-brand-50 text-brand-700' : '')}
                    >
                      <Eye className="h-4 w-4 text-slate-400" />
                      <span className="min-w-0">
                        <span className="block truncate">{opt.office}</span>
                        <span className="block truncate text-[11px] text-slate-400">{opt.name} · {opt.position} · {opt.role}</span>
                      </span>
                    </DropdownItem>
                  );
                })}
                {PREVIEWABLE_ROLES.map((role) => {
                  if (role === 'Department Manager') {
                    return (
                      <div key={role}>
                        <p className="px-2.5 pb-0.5 pt-1.5 text-xs font-medium text-slate-500">Department Manager</p>
                        {DEPARTMENT_MANAGER_OPTIONS.map((opt) => {
                          const active = effectiveRole === 'Department Manager' && previewDepartmentId === opt.departmentId;
                          return (
                            <DropdownItem
                              key={opt.departmentId}
                              onClick={() => { close(); setPreviewDepartmentManager(opt.departmentId); }}
                              className={cn('pl-6', active ? 'bg-brand-50 text-brand-700' : '')}
                            >
                              <Eye className="h-4 w-4 text-slate-400" />
                              <span className="min-w-0">
                                <span className="block truncate">{opt.departmentName}</span>
                                <span className="block truncate text-[11px] text-slate-400">{opt.managerName} · {opt.position}</span>
                              </span>
                            </DropdownItem>
                          );
                        })}
                      </div>
                    );
                  }
                  return (
                    <DropdownItem key={role} onClick={() => { close(); setPreviewRole(role); }} className={effectiveRole === role ? 'bg-brand-50 text-brand-700' : ''}>
                      <Eye className="h-4 w-4 text-slate-400" /> {role}
                    </DropdownItem>
                  );
                })}
              </>
            )}
            {isPreviewing && signedInAsAdministrator && (
              <DropdownItem onClick={() => { close(); returnToAdministrator(); }} className="font-semibold text-brand-700">
                <XIcon className="h-4 w-4" /> Return to Administrator
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownLabel>Appearance</DropdownLabel>
            <div className="mb-1 flex gap-1 px-2.5">
              {([
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
                { value: 'custom', label: 'Custom', icon: Palette },
              ] as { value: ThemeMode; label: string; icon: typeof Sun }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  aria-pressed={mode === opt.value}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium ${mode === opt.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                </button>
              ))}
            </div>
            {mode === 'custom' && (
              <>
                <DropdownLabel>Custom theme</DropdownLabel>
                <div className="mb-1 grid grid-cols-2 gap-1 px-2.5 sm:grid-cols-4">
                  {accentThemes.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setAccentTheme(theme.id)}
                      aria-pressed={accentTheme === theme.id}
                      title={theme.name}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition',
                        accentTheme === theme.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: theme.swatch }} />
                      <span className="min-w-0 flex-1 truncate">{theme.name.replace('BENECO ', '')}</span>
                      {accentTheme === theme.id ? <Check className="h-3 w-3 shrink-0" /> : null}
                    </button>
                  ))}
                </div>
                <p className="px-2.5 pb-1 text-[11px] text-slate-400">
                  <Palette className="mr-1 inline h-3 w-3" /> Saved separately for each username.
                </p>
              </>
            )}
            <DropdownSeparator />
            <DropdownItem onClick={() => { close(); startTour(); }}>
              <PlayCircle className="h-4 w-4 text-slate-400" /> Start Guided Tour
            </DropdownItem>
            <DropdownItem onClick={() => { close(); setAboutOpen(true); }}>
              <Info className="h-4 w-4 text-slate-400" /> About BES
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger onClick={() => { close(); logout(); navigate('/login'); }}>
              <LogOut className="h-4 w-4" /> Log Out
            </DropdownItem>
          </>
        )}
      </DropdownMenu>
    </header>
  );
}
