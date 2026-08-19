import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadSidebarModuleAccess, visibleNavItems } from '@/lib/nav';
import { useRolePreview } from '@/context/RolePreviewContext';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
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

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { effectiveRole, previewDepartmentId } = useRolePreview();
  const { user } = useAuth();
  const { emails, chatMessages } = useData();
  const [moduleAccess, setModuleAccess] = useState(() => loadSidebarModuleAccess());
  const items = visibleNavItems(effectiveRole, previewDepartmentId ?? user?.departmentCode, moduleAccess);
  const unreadMail = emails.filter((m) => m.folder === 'inbox' && !m.read).length;
  const unreadChat = chatMessages.filter((m) => m.senderId !== CURRENT_EMPLOYEE.id && !m.read).length;
  const inboxUnread = unreadMail + unreadChat;

  useEffect(() => {
    const refresh = () => setModuleAccess(loadSidebarModuleAccess());
    window.addEventListener('storage', refresh);
    window.addEventListener('bes-sidebar-access-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('bes-sidebar-access-changed', refresh);
    };
  }, []);

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
        'hidden min-h-0 shrink-0 flex-col bg-sidebar-texture py-4 transition-all duration-200 lg:flex',
        collapsed ? 'w-[68px] px-2' : 'w-64 px-3'
      )}
    >
      <div className="mb-4">
        <Logo collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} />
      <div className="mt-2 border-t border-white/10 px-1 pt-3">
        <button
          onClick={onToggleCollapse}
          className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-ondark-subtle hover:bg-white/5 hover:text-white"
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </div>
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
