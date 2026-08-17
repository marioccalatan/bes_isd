import type { Priority, WorkStatus } from './types';

export const statusStyles: Record<WorkStatus, string> = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Submitted: 'bg-brand-50 text-brand-700 border-brand-200',
  'For Review': 'bg-brand-50 text-brand-700 border-brand-200',
  'Pending Approval': 'bg-gold-50 text-gold-800 border-gold-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  Returned: 'bg-orange-50 text-orange-700 border-orange-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
  'In Progress': 'bg-brand-50 text-brand-700 border-brand-200',
  Completed: 'bg-green-50 text-green-700 border-green-200',
  Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const priorityStyles: Record<Priority, string> = {
  Low: 'bg-slate-100 text-slate-600 border-slate-200',
  Normal: 'bg-brand-50 text-brand-700 border-brand-200',
  High: 'bg-gold-50 text-gold-800 border-gold-200',
  Urgent: 'bg-red-50 text-red-700 border-red-200',
};

export const dotColor: Record<WorkStatus, string> = {
  Draft: 'bg-slate-400',
  Submitted: 'bg-brand-500',
  'For Review': 'bg-brand-500',
  'Pending Approval': 'bg-gold-500',
  Approved: 'bg-green-500',
  Returned: 'bg-orange-500',
  Rejected: 'bg-red-500',
  'In Progress': 'bg-brand-500',
  Completed: 'bg-green-500',
  Cancelled: 'bg-slate-400',
};
