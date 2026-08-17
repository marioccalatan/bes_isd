import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount);
}

export function formatDate(dateStr?: string, pattern = 'MMM d, yyyy'): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), pattern);
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr?: string): string {
  return formatDate(dateStr, "MMM d, yyyy 'at' h:mm a");
}

export function formatTime(dateStr?: string): string {
  return formatDate(dateStr, 'h:mm a');
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

export function processLabel(type: string): string {
  const map: Record<string, string> = {
    leave: 'Leave Request',
    'official-business': 'Official Business',
    'gate-pass': 'Gate Pass',
    'travel-order': 'Travel Order',
    overtime: 'Overtime',
    'personnel-request': 'Personnel Document Request',
    'service-request-it': 'IT Support Request',
    'service-request-facilities': 'Facilities Request',
    'service-request-vehicle': 'Vehicle Request',
    'service-request-supplies': 'Supplies Request',
    'service-request-records': 'Records Request',
    'service-request-comms': 'Communications Assistance',
    'service-request-other': 'Other Institutional Support',
    'attendance-correction': 'Attendance Correction',
    'procurement-request': 'Procurement Request',
    'budget-request': 'Budget Request',
    'payment-request': 'Payment Request',
    'document-routing': 'Document Routing',
    'recruitment-request': 'Recruitment Request',
    'asset-request': 'Asset Request / Transfer',
    'vehicle-request': 'Vehicle Request',
    'project-proposal': 'Project Proposal',
    'legal-review': 'Legal / Policy Review',
    'data-request': 'Data Request',
    'audit-response': 'Audit Response',
    'management-approval': 'Management Approval',
    'risk-compliance-submission': 'Risk and Compliance Submission',
    'support-ticket': 'Support Ticket',
    'enhancement-request': 'Enhancement Request',
  };
  return map[type] ?? type;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

export function randomRef(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000 + 10000);
  return `BES-${prefix}-${year}-${rand}`;
}
