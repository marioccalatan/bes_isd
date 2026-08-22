import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Database, LoaderCircle, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { emptySidebarModuleAccess, visibleNavItems, type SidebarModuleAccess } from '@/lib/nav';
import { fetchDatabaseRuntime, fetchModuleRegistry, switchDatabaseRuntime, type DatabaseRuntimeStatus } from '@/lib/api';
import { isLocalBrowser, loadSyncConnection } from '@/lib/databaseRuntime';
import { useRolePreview } from '@/context/RolePreviewContext';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { CURRENT_EMPLOYEE } from '@/lib/mockData';
import benecoLogo from '@/assets/brand/beneco-logo.png';

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1 shadow-sm">
        <img src={benecoLogo} alt="BENECO" className="h-full w-full object-contain" />
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold text-white">BENECO</p>
          <p className="truncate text-[11px] font-medium text-ondark-subtle">Enterprise System</p>
        </div>
      )}
    </div>
  );
}

function DatabaseRuntimeToggle({ collapsed }: { collapsed?: boolean }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [runtime, setRuntime] = useState<DatabaseRuntimeStatus | null>(null);
  const [switching, setSwitching] = useState(false);
  const administrator = user?.role === 'Administrator' || user?.roles?.includes('Administrator');
  const available = administrator && isLocalBrowser();

  useEffect(() => {
    if (!available || !token) return;
    let cancelled = false;
    fetchDatabaseRuntime(token)
      .then((status) => { if (!cancelled) setRuntime(status); })
      .catch((error) => {
        if (!cancelled) console.warn('Unable to load database runtime status.', error);
      });
    return () => { cancelled = true; };
  }, [available, token]);

  if (!available) return null;
  const usingServer = runtime?.activeDatabase === 'server';

  async function toggleDatabase() {
    if (!token || switching) return;
    const target = usingServer ? 'local' : 'server';
    const connection = target === 'server' ? loadSyncConnection() : undefined;
    if (target === 'server' && (!connection?.savePassword || !connection.password)) {
      toast({
        kind: 'warning',
        title: 'Save the server credentials first',
        description: 'Open Administration → Database Sync, enter the Server Oracle credentials, and enable “Save password for this browser session.”',
      });
      return;
    }
    setSwitching(true);
    try {
      const next = await switchDatabaseRuntime(token, target, connection);
      setRuntime(next);
      toast({
        kind: 'success',
        title: `${target === 'server' ? 'Server' : 'Local'} database selected`,
        description: 'Reloading BES so every screen uses the selected Oracle database.',
      });
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      toast({
        kind: 'error',
        title: 'Database switch failed',
        description: error instanceof Error ? error.message : 'Unable to change the active Oracle database.',
      });
      setSwitching(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={usingServer}
        aria-label={`Using ${usingServer ? 'Server' : 'Local'} Oracle database`}
        title={`Database: ${usingServer ? 'Server' : 'Local'}`}
        onClick={toggleDatabase}
        disabled={!runtime || switching}
        className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-ondark transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        {switching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
      </button>
    );
  }

  return (
    <div className="mb-2 rounded-lg border border-white/15 bg-black/10 p-2.5 text-ondark">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wide"><Database className="h-3.5 w-3.5" /> Database</span>
        <span className={cn('rounded-full px-2 py-0.5 font-semibold', usingServer ? 'bg-blue-500/20 text-blue-200' : 'bg-emerald-500/20 text-emerald-200')}>
          {runtime ? (usingServer ? 'Server' : 'Local') : 'Checking'}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={usingServer}
        aria-label={`Database source: ${usingServer ? 'Server' : 'Local'}. Switch to ${usingServer ? 'Local' : 'Server'}.`}
        onClick={toggleDatabase}
        disabled={!runtime || switching}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-xs transition-colors hover:bg-white/10 disabled:opacity-50"
      >
        <span className={cn('font-medium transition-colors', !usingServer ? 'text-white' : 'text-ondark-subtle')}>Local</span>
        <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', usingServer ? 'bg-blue-500' : 'bg-emerald-500')}>
          <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', usingServer && 'translate-x-4')} />
        </span>
        <span className={cn('font-medium transition-colors', usingServer ? 'text-white' : 'text-ondark-subtle')}>Server</span>
        {switching && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      </button>
    </div>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { effectiveRole, previewDepartmentId } = useRolePreview();
  const { token, user } = useAuth();
  const { emails, chatMessages } = useData();
  const [moduleAccess, setModuleAccess] = useState<SidebarModuleAccess | null>(null);
  const departmentItems = visibleNavItems(
    effectiveRole,
    previewDepartmentId ?? user?.departmentCode,
    moduleAccess ?? emptySidebarModuleAccess(),
  );
  const items = departmentItems;
  const unreadMail = emails.filter((m) => m.folder === 'inbox' && !m.read).length;
  const unreadChat = chatMessages.filter((m) => m.senderId !== CURRENT_EMPLOYEE.id && !m.read).length;
  const inboxUnread = unreadMail + unreadChat;

  useEffect(() => {
    setModuleAccess(null);
    if (!token) return;
    let cancelled = false;
    fetchModuleRegistry(token)
      .then((rows) => {
        if (!cancelled) setModuleAccess(Object.fromEntries(rows.map((row) => [row.path, row.departmentIds])) as SidebarModuleAccess);
      })
      .catch((error) => {
        console.warn('Unable to load Oracle module access.', error);
        if (!cancelled) setModuleAccess(emptySidebarModuleAccess());
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3 scrollbar-thin" aria-label="Primary">
      {items.map((item) => {
        const badge = item.to === '/inbox' ? inboxUnread : 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-ondark hover:bg-white/5 hover:text-white'
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
            {badge > 0 && (
              <span className={cn('flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-brand-950', collapsed && 'absolute right-0.5 top-0.5 h-2 w-2 min-w-0 p-0')}>
                {!collapsed && (badge > 99 ? '99+' : badge)}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  return (
    <aside
      className={cn(
        'no-print hidden min-h-0 shrink-0 flex-col bg-sidebar-texture py-4 transition-all duration-200 lg:flex',
        collapsed ? 'w-[68px] px-2' : 'w-64 px-3'
      )}
    >
      <div className={cn('mb-4 flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && <Logo />}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-lg p-2 text-ondark-subtle transition-colors hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <NavList collapsed={collapsed} />
      <DatabaseRuntimeToggle collapsed={collapsed} />
    </aside>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden no-print">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Navigation menu" className="absolute left-0 top-0 flex h-full min-h-0 w-72 flex-col bg-sidebar-texture py-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between px-3">
          <Logo />
          <button onClick={onClose} aria-label="Close menu" className="rounded-md p-1.5 text-ondark-subtle hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <NavList onNavigate={onClose} />
      </div>
    </div>
  );
}
