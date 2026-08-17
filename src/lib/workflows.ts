import type { DepartmentId, ProcessType } from './types';

export interface WorkflowDef {
  processType: ProcessType;
  name: string;
  description: string;
  processOwner: string;
  departments: DepartmentId[];
  avgCompletionTime: string;
  detailed?: boolean;
}

export const WORKFLOWS: WorkflowDef[] = [
  {
    processType: 'procurement-request', name: 'Procurement Request',
    description: 'Route a request for goods or services from the requesting department through budget review to procurement and final approval.',
    processOwner: 'NNSD Procurement Officer', departments: ['ISD', 'NNSD', 'CPD'], avgCompletionTime: '7 working days', detailed: true,
  },
  {
    processType: 'budget-request', name: 'Budget Request',
    description: 'Request new budget allocation or realignment of existing budget lines.',
    processOwner: 'NNSD Budget Officer', departments: ['NNSD', 'CPD'], avgCompletionTime: '5 working days',
  },
  {
    processType: 'payment-request', name: 'Payment Request',
    description: 'Request disbursement of payment to a supplier, contractor, or other payee.',
    processOwner: 'NNSD Finance Officer', departments: ['NNSD'], avgCompletionTime: '4 working days',
  },
  {
    processType: 'document-routing', name: 'Document Routing',
    description: 'Route documents such as agreements, reports, or correspondence for review, endorsement, and approval across offices.',
    processOwner: 'Corporate Records Officer', departments: ['ISD', 'CPD'], avgCompletionTime: '6 working days', detailed: true,
  },
  {
    processType: 'recruitment-request', name: 'Recruitment Request',
    description: 'Request to fill a vacant position or create a new position, routed through HR and executive approval.',
    processOwner: 'ISD HR Officer', departments: ['ISD'], avgCompletionTime: '10 working days',
  },
  {
    processType: 'asset-request', name: 'Asset Request or Transfer',
    description: 'Request a new company asset or transfer an existing asset between offices.',
    processOwner: 'NNSD Property Officer', departments: ['NNSD'], avgCompletionTime: '3 working days',
  },
  {
    processType: 'vehicle-request', name: 'Vehicle Request',
    description: 'Request a service vehicle for official business or institutional activities.',
    processOwner: 'NNSD Fleet Coordinator', departments: ['NNSD'], avgCompletionTime: '2 working days',
  },
  {
    processType: 'project-proposal', name: 'Project Proposal',
    description: 'Propose a new institutional project or initiative, routed through department, corporate planning, budget, and executive approval.',
    processOwner: 'CPD Project Management Officer', departments: ['ISD', 'CPD', 'NNSD'], avgCompletionTime: '15 working days', detailed: true,
  },
  {
    processType: 'legal-review', name: 'Legal or Policy Review',
    description: 'Request legal or policy review of a document, agreement, or institutional issue.',
    processOwner: 'CPD Legal Review Unit', departments: ['CPD'], avgCompletionTime: '8 working days',
  },
  {
    processType: 'data-request', name: 'Data Request',
    description: 'Request data, reports, or records maintained by another department.',
    processOwner: 'CPD Data Custodian', departments: ['CPD'], avgCompletionTime: '3 working days',
  },
  {
    processType: 'audit-response', name: 'Audit Response',
    description: 'Submit a management response to an audit finding or recommendation.',
    processOwner: 'Audit Department', departments: ['AUD'], avgCompletionTime: '10 working days',
  },
  {
    processType: 'management-approval', name: 'Management Approval',
    description: 'Route a general matter for management or executive approval.',
    processOwner: 'Office of the General Manager', departments: ['CPD'], avgCompletionTime: '5 working days',
  },
  {
    processType: 'risk-compliance-submission', name: 'Risk and Compliance Submission',
    description: 'Submit a risk item or compliance concern for review by Corporate Planning risk management.',
    processOwner: 'CPD Risk Management Unit', departments: ['CPD', 'AUD'], avgCompletionTime: '6 working days',
  },
];
