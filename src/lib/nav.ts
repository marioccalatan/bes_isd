import {
  Home, Inbox, ListChecks, Briefcase, LayoutGrid, GitBranch, CalendarDays, Newspaper,
  FileText, HardDrive, Award, Network, BarChart3, LifeBuoy, ShieldCheck,
} from 'lucide-react';
import type { AppRole, DepartmentId } from './types';
import { canSeeAdministration } from './permissions';
import { loadState, saveState } from './storage';

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Home;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Enterprise Home', to: '/home', icon: Home },
  { label: 'Inbox', to: '/inbox', icon: Inbox },
  { label: 'My Work', to: '/my-work', icon: ListChecks },
  { label: 'Employee Services', to: '/services', icon: Briefcase },
  { label: 'My Workspace', to: '/workspace', icon: LayoutGrid },
  { label: 'Shared Workflows', to: '/workflows', icon: GitBranch },
  { label: 'Calendar', to: '/calendar', icon: CalendarDays },
  { label: 'News and Memos', to: '/news', icon: Newspaper },
  { label: 'Documents and Policies', to: '/documents', icon: FileText },
  { label: 'My Storage', to: '/storage', icon: HardDrive },
  { label: 'ISO / QMS', to: '/iso', icon: Award },
  { label: 'Organization', to: '/organization', icon: Network },
  { label: 'Reports and Analytics', to: '/reports', icon: BarChart3 },
  { label: 'Help and Support', to: '/help', icon: LifeBuoy },
  { label: 'Administration', to: '/admin', icon: ShieldCheck, adminOnly: true },
];

export const SIDEBAR_MODULE_ACCESS_STORAGE_KEY = 'sidebar-module-access';

export const SIDEBAR_DEPARTMENT_IDS: DepartmentId[] = ['ISD', 'NSD', 'NNSD', 'AUD', 'CPD', 'PGD'];

export type SidebarModuleAccess = Record<string, DepartmentId[]>;

export function defaultSidebarModuleAccess(): SidebarModuleAccess {
  return Object.fromEntries(
    NAV_ITEMS.map((item) => [item.to, item.adminOnly ? [] : SIDEBAR_DEPARTMENT_IDS])
  ) as SidebarModuleAccess;
}

function normalizeSidebarModuleAccess(access: unknown): SidebarModuleAccess {
  const defaults = defaultSidebarModuleAccess();
  if (!access || typeof access !== 'object') return defaults;

  const raw = access as Record<string, unknown>;
  return Object.fromEntries(
    NAV_ITEMS.map((item) => {
      const configured = raw[item.to];
      const departmentIds = Array.isArray(configured)
        ? configured
          .map(String)
          .filter((id): id is DepartmentId => SIDEBAR_DEPARTMENT_IDS.includes(id as DepartmentId))
        : defaults[item.to];

      return [item.to, item.adminOnly ? [] : Array.from(new Set(departmentIds))];
    })
  ) as SidebarModuleAccess;
}

export function loadSidebarModuleAccess(): SidebarModuleAccess {
  return normalizeSidebarModuleAccess(loadState(SIDEBAR_MODULE_ACCESS_STORAGE_KEY, defaultSidebarModuleAccess));
}

export function saveSidebarModuleAccess(access: SidebarModuleAccess): SidebarModuleAccess {
  const normalized = normalizeSidebarModuleAccess(access);
  saveState(SIDEBAR_MODULE_ACCESS_STORAGE_KEY, normalized);
  window.dispatchEvent(new Event('bes-sidebar-access-changed'));
  return normalized;
}

export function isSidebarModuleEnabledForDepartment(item: NavItem, departmentId?: string | null, access = loadSidebarModuleAccess()): boolean {
  if (item.adminOnly) return false;
  if (!departmentId) return true;
  return (access[item.to] ?? SIDEBAR_DEPARTMENT_IDS).includes(departmentId as DepartmentId);
}

export function visibleNavItems(role: AppRole, departmentId?: string | null, access = loadSidebarModuleAccess()): NavItem[] {
  if (canSeeAdministration(role)) return NAV_ITEMS;
  return NAV_ITEMS.filter((item) => isSidebarModuleEnabledForDepartment(item, departmentId, access));
}
