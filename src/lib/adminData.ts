export const PERMISSION_FACTORS = [
  'Employment Status', 'Department', 'Unit', 'Position', 'Approval Authority', 'Special Assignment', 'Committee Membership',
];

export const ROLES_FOR_MATRIX = ['Employee', 'Supervisor', 'Department Manager', 'General Manager', 'Board Member', 'Process Owner', 'Auditor', 'Administrator'];

export const CAPABILITIES = [
  'File personal requests',
  'Approve team requests',
  'View department reports',
  'View enterprise reports',
  'Access Board-restricted documents',
  'Access confidential audit records',
  'Publish news and memos',
  'Manage technical administration',
];

// true = capability granted for that role, mirroring the logic in lib/permissions.ts
export const MATRIX: Record<string, boolean[]> = {
  Employee:              [true, false, false, false, false, false, false, false],
  Supervisor:            [true, true, false, false, false, false, false, false],
  'Department Manager':  [true, true, true, false, false, false, false, true],
  'General Manager':     [true, true, true, true, true, false, false, true],
  'Board Member':        [true, false, true, true, true, false, false, false],
  'Process Owner':       [true, false, true, false, false, false, false, false],
  Auditor:               [true, false, true, true, false, true, false, false],
  Administrator:         [true, true, true, true, false, false, true, true],
};

export const NOTIFICATION_TEMPLATES = [
  { category: 'Approval Required', title: '{{RequestTitle}}', message: '{{RequestorName}} submitted a request awaiting your approval.' },
  { category: 'Request Update', title: 'Request {{Status}}', message: 'Your request {{ReferenceNumber}} has been {{Status}}.' },
  { category: 'Memo', title: '{{MemoTitle}}', message: 'New {{Category}} from {{IssuingOffice}} requires your attention.' },
  { category: 'Calendar Reminder', title: '{{EventTitle}}', message: 'Upcoming event: {{EventTime}} at {{Location}}.' },
  { category: 'Assignment', title: '{{TaskTitle}}', message: 'You have been assigned to {{TaskTitle}}.' },
  { category: 'Deadline', title: '{{DeadlineTitle}}', message: 'Deadline approaching: due in {{DaysRemaining}} day(s).' },
  { category: 'System Message', title: 'System Notice', message: '{{SystemMessage}}' },
];

export const REFERENCE_PREFIXES: { prefix: string; process: string }[] = [
  { prefix: 'LVE', process: 'Leave Request' },
  { prefix: 'OB', process: 'Official Business' },
  { prefix: 'GP', process: 'Gate Pass' },
  { prefix: 'TRV', process: 'Travel Order' },
  { prefix: 'OT', process: 'Overtime' },
  { prefix: 'PRS', process: 'Personnel Document Request' },
  { prefix: 'SVC', process: 'Service Request' },
  { prefix: 'PRC', process: 'Procurement Request' },
  { prefix: 'DOC', process: 'Document Routing' },
  { prefix: 'PRJ', process: 'Project Proposal' },
  { prefix: 'BUD', process: 'Budget Request' },
  { prefix: 'PAY', process: 'Payment Request' },
  { prefix: 'TCK', process: 'Support Ticket' },
];
