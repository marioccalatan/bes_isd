import {
  Home, Inbox, ListChecks, Briefcase, LayoutGrid, GitBranch, CalendarDays, Newspaper,
  FileText, HardDrive, Award, Network, BarChart3, LifeBuoy, ShieldCheck,
} from 'lucide-react';
import type { AppRole } from './types';
import { canSeeAdministration } from './permissions';

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

export function visibleNavItems(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.adminOnly || canSeeAdministration(role));
}
