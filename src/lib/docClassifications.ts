import { accessExplanation } from './permissions';
import type { DocumentClassification } from './types';

export const CLASS_STYLES_LIST: { label: DocumentClassification; style: string; explanation: string }[] = [
  { label: 'Public to All Employees', style: 'border-green-200 bg-green-50 text-green-700', explanation: 'Visible to every BES user regardless of role or department.' },
  { label: 'Department Restricted', style: 'border-brand-200 bg-brand-50 text-brand-700', explanation: accessExplanation('Department Restricted') || 'Visible to department staff and management roles only.' },
  { label: 'Management Restricted', style: 'border-gold-200 bg-gold-50 text-gold-800', explanation: accessExplanation('Management Restricted') },
  { label: 'Board Restricted', style: 'border-orange-200 bg-orange-50 text-orange-700', explanation: accessExplanation('Board Restricted') },
  { label: 'Confidential', style: 'border-red-200 bg-red-50 text-red-700', explanation: accessExplanation('Confidential') },
];
