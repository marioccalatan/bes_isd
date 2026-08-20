import {
  Map, Network, FileCheck, Database, Gauge, Wrench, ClipboardList, Zap,
  SlidersHorizontal, MessageSquare, HardDrive, Factory, BadgeCheck, GitBranch,
  BookOpen, AlertTriangle, Presentation, Settings, Warehouse, User, Users, Car,
  UserPlus, GraduationCap, TrendingUp, HeartHandshake, Megaphone, HandHeart,
  Archive, FileStack, CalendarRange, Building2,
  type LucideIcon,
} from 'lucide-react';

export const TOOL_ICONS: Record<string, LucideIcon> = {
  Map, Network, FileCheck, Database, Gauge, Wrench, ClipboardList, Zap,
  SlidersHorizontal, MessageSquare, HardDrive, Factory, BadgeCheck, GitBranch,
  BookOpen, AlertTriangle, Presentation, Settings, Warehouse, User, Users, Car,
  UserPlus, GraduationCap, TrendingUp, HeartHandshake, Megaphone, HandHeart,
  Archive, FileStack, CalendarRange, Building2,
};

export function getToolIcon(iconKey: string): LucideIcon {
  return TOOL_ICONS[iconKey] ?? Settings;
}
