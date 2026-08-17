import type { ApprovalStep, ProcessType } from './types';
import { CURRENT_EMPLOYEE } from './mockData';

export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select' | 'checkbox' | 'participants' | 'file';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  hint?: string;
  span?: 'full' | 'half';
}

export interface ProcessDef {
  type: ProcessType;
  refPrefix: string;
  title: string;
  summary: string;
  icon: string;
  fields: FieldDef[];
  approvalChain: (fields: Record<string, unknown>) => Omit<ApprovalStep, 'id' | 'status' | 'actedAt' | 'remarks'>[];
  titleFromFields?: (fields: Record<string, unknown>) => string;
}

const managerName = 'Herminio C. Padilla Jr.';

export const PROCESS_DEFS: Record<ProcessType, ProcessDef> = {
  leave: {
    type: 'leave', refPrefix: 'LVE', title: 'Leave Request', summary: 'File vacation, sick, or special leave.', icon: 'CalendarOff',
    fields: [
      { name: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: ['Vacation Leave', 'Sick Leave', 'Special Privilege Leave', 'Maternity/Paternity Leave', 'Emergency Leave'] },
      { name: 'dateFrom', label: 'Date From', type: 'date', required: true, span: 'half' },
      { name: 'dateTo', label: 'Date To', type: 'date', required: true, span: 'half' },
      { name: 'workingDays', label: 'Number of Working Days', type: 'number', required: true, span: 'half' },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true },
      { name: 'attachment', label: 'Supporting Attachment (e.g. Medical Certificate)', type: 'file' },
    ],
    approvalChain: () => [{ stepName: 'Supervisor', approverName: managerName }],
    titleFromFields: (f) => `${f.leaveType ?? 'Leave'} Request`,
  },
  'official-business': {
    type: 'official-business', refPrefix: 'OB', title: 'Official Business', summary: 'Authorization for field or off-site work.', icon: 'Briefcase',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, span: 'half' },
      { name: 'timeFrom', label: 'Time From', type: 'time', required: true, span: 'half' },
      { name: 'timeTo', label: 'Time To', type: 'time', required: true, span: 'half' },
      { name: 'destination', label: 'Destination', type: 'text', required: true, span: 'half' },
      { name: 'transportation', label: 'Transportation', type: 'select', options: ['Service Vehicle', 'Personal Vehicle', 'Public Transport', 'Other'] },
      { name: 'participants', label: 'Participants', type: 'participants' },
      { name: 'expectedOutput', label: 'Expected Output', type: 'textarea', required: true },
      { name: 'attachment', label: 'Attachment', type: 'file' },
    ],
    approvalChain: () => [{ stepName: 'Supervisor', approverName: managerName }],
  },
  'gate-pass': {
    type: 'gate-pass', refPrefix: 'GP', title: 'Gate Pass', summary: 'Personal or property gate pass.', icon: 'DoorOpen',
    fields: [
      { name: 'passType', label: 'Gate Pass Type', type: 'select', required: true, options: ['Personal', 'Property'] },
      { name: 'dateOut', label: 'Date', type: 'date', required: true, span: 'half' },
      { name: 'expectedReturn', label: 'Expected Return', type: 'date', required: true, span: 'half' },
      { name: 'destination', label: 'Destination', type: 'text', required: true },
      { name: 'propertyItem', label: 'Property / Item Description', type: 'text' },
      { name: 'propertyQty', label: 'Quantity', type: 'number', span: 'half' },
      { name: 'assetNo', label: 'Asset Number', type: 'text', span: 'half' },
    ],
    approvalChain: () => [
      { stepName: 'Supervisor', approverName: managerName },
      { stepName: 'Security Validation', approverName: 'Main Gate Security' },
    ],
  },
  'travel-order': {
    type: 'travel-order', refPrefix: 'TRV', title: 'Travel Order', summary: 'Official travel with approval routing.', icon: 'Plane',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true },
      { name: 'dateFrom', label: 'Travel Date From', type: 'date', required: true, span: 'half' },
      { name: 'dateTo', label: 'Travel Date To', type: 'date', required: true, span: 'half' },
      { name: 'transportation', label: 'Transportation', type: 'select', options: ['Service Vehicle', 'Air Travel', 'Land Travel', 'Other'] },
      { name: 'participants', label: 'Participants', type: 'participants' },
      { name: 'estimatedExpenses', label: 'Estimated Expenses (PHP)', type: 'number', required: true, span: 'half' },
      { name: 'cashAdvance', label: 'Cash Advance Required', type: 'checkbox', span: 'half' },
      { name: 'fundingSource', label: 'Funding Source', type: 'text' },
      { name: 'attachment', label: 'Attachment', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Supervisor', approverName: managerName },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  overtime: {
    type: 'overtime', refPrefix: 'OT', title: 'Overtime Request', summary: 'Request overtime work authorization.', icon: 'Timer',
    fields: [
      { name: 'date', label: 'Date', type: 'date', required: true, span: 'half' },
      { name: 'timeFrom', label: 'Start Time', type: 'time', required: true, span: 'half' },
      { name: 'timeTo', label: 'End Time', type: 'time', required: true, span: 'half' },
      { name: 'totalHours', label: 'Total Hours', type: 'number', required: true, span: 'half' },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true },
      { name: 'expectedOutput', label: 'Expected Output', type: 'textarea', required: true },
    ],
    approvalChain: () => [{ stepName: 'Supervisor', approverName: managerName }],
  },
  'personnel-request': {
    type: 'personnel-request', refPrefix: 'PRS', title: 'Personnel Document Request', summary: 'COE, service record, and other HR documents.', icon: 'FileBadge',
    fields: [
      { name: 'documentType', label: 'Document Type', type: 'select', required: true, options: ['Certificate of Employment', 'Service Record', 'Employment Verification', 'Training Record', 'Other Personnel Document'] },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
    ],
    approvalChain: () => [{ stepName: 'HR Processing', approverName: 'ISD Records Officer' }],
  },
  'service-request-it': serviceDef('service-request-it', 'IT Support Request', 'Laptop'),
  'service-request-facilities': serviceDef('service-request-facilities', 'Facilities Request', 'Wrench'),
  'service-request-vehicle': serviceDef('service-request-vehicle', 'Vehicle Request', 'Car'),
  'service-request-supplies': serviceDef('service-request-supplies', 'Supplies Request', 'Package'),
  'service-request-records': serviceDef('service-request-records', 'Records Request', 'Archive'),
  'service-request-comms': serviceDef('service-request-comms', 'Communications Assistance Request', 'MessageSquare'),
  'service-request-other': serviceDef('service-request-other', 'Other Institutional Support Request', 'HelpCircle'),
  'attendance-correction': {
    type: 'attendance-correction', refPrefix: 'ATC', title: 'Attendance Correction Request', summary: 'Correct a time-in/time-out discrepancy.', icon: 'Clock',
    fields: [
      { name: 'date', label: 'Date of Record', type: 'date', required: true, span: 'half' },
      { name: 'correctionType', label: 'Correction Type', type: 'select', required: true, options: ['Missing Time-In', 'Missing Time-Out', 'Wrong Time Recorded', 'Other'], span: 'half' },
      { name: 'correctTime', label: 'Correct Time', type: 'time' },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true },
    ],
    approvalChain: () => [{ stepName: 'Supervisor', approverName: managerName }],
  },
  'procurement-request': {
    type: 'procurement-request', refPrefix: 'PRC', title: 'Procurement Request', summary: 'Request goods or services through procurement.', icon: 'ShoppingCart',
    fields: [
      { name: 'requestingDepartment', label: 'Requesting Department', type: 'text', required: true },
      { name: 'items', label: 'Requested Items', type: 'textarea', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', required: true, span: 'half' },
      { name: 'estimatedCost', label: 'Estimated Cost (PHP)', type: 'number', required: true, span: 'half' },
      { name: 'requiredDate', label: 'Required Date', type: 'date', required: true, span: 'half' },
      { name: 'budgetCode', label: 'Budget Code', type: 'text', span: 'half' },
      { name: 'specifications', label: 'Specifications', type: 'textarea' },
      { name: 'attachment', label: 'Attachments', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Supervisor', approverName: 'ISD Unit Head' },
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Budget Review', approverName: 'NNSD Budget Officer' },
      { stepName: 'Procurement', approverName: 'NNSD Procurement Officer' },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  'budget-request': {
    type: 'budget-request', refPrefix: 'BUD', title: 'Budget Request', summary: 'Request budget allocation or realignment.', icon: 'Wallet',
    fields: [
      { name: 'requestingDepartment', label: 'Requesting Department', type: 'text', required: true },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      { name: 'amount', label: 'Amount (PHP)', type: 'number', required: true, span: 'half' },
      { name: 'budgetLine', label: 'Budget Line Item', type: 'text', span: 'half' },
      { name: 'attachment', label: 'Attachments', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Budget Review', approverName: 'NNSD Budget Officer' },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  'payment-request': {
    type: 'payment-request', refPrefix: 'PAY', title: 'Payment Request', summary: 'Request disbursement of payment to a payee.', icon: 'Banknote',
    fields: [
      { name: 'payee', label: 'Payee', type: 'text', required: true },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      { name: 'amount', label: 'Amount (PHP)', type: 'number', required: true, span: 'half' },
      { name: 'dueDate', label: 'Due Date', type: 'date', span: 'half' },
      { name: 'attachment', label: 'Supporting Documents', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Finance Review', approverName: 'NNSD Finance Officer' },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  'document-routing': {
    type: 'document-routing', refPrefix: 'DOC', title: 'Document Routing', summary: 'Route a document for review and approval.', icon: 'FileText',
    fields: [
      { name: 'documentTitle', label: 'Document Title', type: 'text', required: true },
      { name: 'documentType', label: 'Document Type', type: 'select', required: true, options: ['Policy Document', 'Agreement', 'Report', 'Correspondence', 'Other'] },
      { name: 'originatingOffice', label: 'Originating Office', type: 'text', required: true, span: 'half' },
      { name: 'recipients', label: 'Recipients', type: 'text', required: true, span: 'half' },
      { name: 'actionRequested', label: 'Action Requested', type: 'select', required: true, options: ['Review and Approve', 'Review and Endorse', 'For Information', 'For Signature'] },
      { name: 'dueDate', label: 'Due Date', type: 'date', span: 'half' },
      { name: 'confidentiality', label: 'Confidentiality Level', type: 'select', options: ['Public to All Employees', 'Department Restricted', 'Management Restricted', 'Board Restricted', 'Confidential'], span: 'half' },
      { name: 'attachment', label: 'Attachments', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Originating Office', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Receiving Office', approverName: 'Corporate Planning — Legal Review' },
      { stepName: 'Reviewer', approverName: 'CPD Department Manager' },
      { stepName: 'Approving Authority', approverName: managerName },
      { stepName: 'Records', approverName: 'ISD Records Officer' },
    ],
  },
  'recruitment-request': {
    type: 'recruitment-request', refPrefix: 'REC', title: 'Recruitment Request', summary: 'Request to fill a vacant or new position.', icon: 'Users',
    fields: [
      { name: 'positionTitle', label: 'Position Title', type: 'text', required: true },
      { name: 'department', label: 'Department', type: 'text', required: true, span: 'half' },
      { name: 'headcount', label: 'Number of Positions', type: 'number', required: true, span: 'half' },
      { name: 'justification', label: 'Justification', type: 'textarea', required: true },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'HR Review', approverName: 'ISD HR Officer' },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  'asset-request': {
    type: 'asset-request', refPrefix: 'AST', title: 'Asset Request / Transfer', summary: 'Request or transfer a company asset.', icon: 'Package',
    fields: [
      { name: 'assetDescription', label: 'Asset Description', type: 'text', required: true },
      { name: 'requestType', label: 'Request Type', type: 'select', required: true, options: ['New Request', 'Transfer', 'Replacement'] },
      { name: 'justification', label: 'Justification', type: 'textarea', required: true },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Property Custodian', approverName: 'NNSD Property Officer' },
    ],
  },
  'vehicle-request': {
    type: 'vehicle-request', refPrefix: 'VEH', title: 'Vehicle Request', summary: 'Request a service vehicle for official use.', icon: 'Car',
    fields: [
      { name: 'destination', label: 'Destination', type: 'text', required: true, span: 'half' },
      { name: 'date', label: 'Date Needed', type: 'date', required: true, span: 'half' },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      { name: 'passengers', label: 'Number of Passengers', type: 'number', span: 'half' },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Fleet Coordinator', approverName: 'NNSD Fleet Coordinator' },
    ],
  },
  'project-proposal': {
    type: 'project-proposal', refPrefix: 'PRJ', title: 'Project Proposal', summary: 'Propose a new institutional project or initiative.', icon: 'Rocket',
    fields: [
      { name: 'projectTitle', label: 'Project Title', type: 'text', required: true },
      { name: 'proponent', label: 'Proponent', type: 'text', required: true, span: 'half' },
      { name: 'strategicObjective', label: 'Strategic Objective', type: 'text', required: true, span: 'half' },
      { name: 'background', label: 'Background', type: 'textarea', required: true },
      { name: 'expectedOutputs', label: 'Expected Outputs', type: 'textarea', required: true },
      { name: 'targetBeneficiaries', label: 'Target Beneficiaries', type: 'text' },
      { name: 'schedule', label: 'Schedule', type: 'text', span: 'half' },
      { name: 'estimatedBudget', label: 'Estimated Budget (PHP)', type: 'number', required: true, span: 'half' },
      { name: 'risks', label: 'Risks', type: 'textarea' },
      { name: 'attachment', label: 'Supporting Documents', type: 'file' },
    ],
    approvalChain: () => [
      { stepName: 'Department Manager', approverName: CURRENT_EMPLOYEE.name },
      { stepName: 'Corporate Planning', approverName: 'Ramon B. Aquino' },
      { stepName: 'Budget / Finance', approverName: 'NNSD Budget Officer' },
      { stepName: 'General Manager', approverName: managerName },
    ],
  },
  'legal-review': {
    type: 'legal-review', refPrefix: 'LGL', title: 'Legal / Policy Review', summary: 'Request legal or policy review of a document or issue.', icon: 'Scale',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'attachment', label: 'Attachments', type: 'file' },
    ],
    approvalChain: () => [{ stepName: 'Legal / Policy Review', approverName: 'Corporate Planning — Legal Review' }],
  },
  'data-request': {
    type: 'data-request', refPrefix: 'DAT', title: 'Data Request', summary: 'Request data or reports from another department.', icon: 'Database',
    fields: [
      { name: 'dataNeeded', label: 'Data / Report Needed', type: 'textarea', required: true },
      { name: 'purpose', label: 'Purpose', type: 'textarea', required: true },
      { name: 'neededBy', label: 'Needed By', type: 'date' },
    ],
    approvalChain: () => [{ stepName: 'Data Custodian Review', approverName: 'CPD Data Custodian' }],
  },
  'audit-response': {
    type: 'audit-response', refPrefix: 'ADR', title: 'Audit Response', summary: 'Submit a management response to an audit finding.', icon: 'ClipboardCheck',
    fields: [
      { name: 'findingReference', label: 'Audit Finding Reference', type: 'text', required: true },
      { name: 'response', label: 'Management Response', type: 'textarea', required: true },
      { name: 'targetDate', label: 'Target Completion Date', type: 'date' },
    ],
    approvalChain: () => [{ stepName: 'Audit Department Review', approverName: 'Corazon P. Villanueva' }],
  },
  'management-approval': {
    type: 'management-approval', refPrefix: 'MGT', title: 'Management Approval', summary: 'Request general management approval.', icon: 'Stamp',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'attachment', label: 'Attachments', type: 'file' },
    ],
    approvalChain: () => [{ stepName: 'General Manager', approverName: managerName }],
  },
  'risk-compliance-submission': {
    type: 'risk-compliance-submission', refPrefix: 'RSK', title: 'Risk and Compliance Submission', summary: 'Submit a risk or compliance item for review.', icon: 'ShieldAlert',
    fields: [
      { name: 'riskTitle', label: 'Risk / Compliance Item', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
      { name: 'likelihood', label: 'Likelihood', type: 'select', options: ['Low', 'Medium', 'High'] },
      { name: 'impact', label: 'Impact', type: 'select', options: ['Low', 'Medium', 'High'] },
    ],
    approvalChain: () => [{ stepName: 'Corporate Planning — Risk Management', approverName: 'Ramon B. Aquino' }],
  },
  'support-ticket': {
    type: 'support-ticket', refPrefix: 'TCK', title: 'Support Ticket', summary: 'Submit a support request.', icon: 'LifeBuoy',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
    ],
    approvalChain: () => [],
  },
  'enhancement-request': {
    type: 'enhancement-request', refPrefix: 'ENH', title: 'Enhancement Request', summary: 'Suggest an enhancement to BES.', icon: 'Sparkles',
    fields: [
      { name: 'subject', label: 'Subject', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea', required: true },
    ],
    approvalChain: () => [],
  },
};

function serviceDef(type: ProcessType, title: string, icon: string): ProcessDef {
  return {
    type, refPrefix: 'SVC', title, summary: `Submit a ${title.toLowerCase()}.`, icon,
    fields: [
      { name: 'category', label: 'Category', type: 'text', required: true },
      { name: 'description', label: 'Description of Request', type: 'textarea', required: true },
      { name: 'attachment', label: 'Attachment', type: 'file' },
    ],
    approvalChain: () => [{ stepName: 'Processing', approverName: type === 'service-request-it' ? 'IT Support Desk' : 'Facilities Team' }],
  };
}
