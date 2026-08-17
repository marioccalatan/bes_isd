import type { AppRole, DocumentClassification } from './types';

const MANAGER_TIER: AppRole[] = ['Department Manager', 'General Manager', 'Administrator'];
const APPROVER_TIER: AppRole[] = ['Supervisor', 'Department Manager', 'General Manager', 'Administrator'];

export function canSeeAdministration(role: AppRole): boolean {
  return MANAGER_TIER.includes(role);
}

export function canApprove(role: AppRole): boolean {
  return APPROVER_TIER.includes(role);
}

export function canSeeTeamItems(role: AppRole): boolean {
  return MANAGER_TIER.includes(role) || role === 'Supervisor';
}

export function canSeeExecutiveReports(role: AppRole): boolean {
  return ['Department Manager', 'General Manager', 'Board Member', 'Auditor', 'Administrator'].includes(role);
}

export function canAccessDocument(classification: DocumentClassification, role: AppRole): boolean {
  switch (classification) {
    case 'Public to All Employees':
      return true;
    case 'Department Restricted':
      return role !== 'Employee';
    case 'Management Restricted':
      return ['Department Manager', 'General Manager', 'Administrator', 'Board Member'].includes(role);
    case 'Board Restricted':
      return ['Board Member', 'General Manager'].includes(role);
    case 'Confidential':
      return ['Auditor', 'Board Member'].includes(role);
    default:
      return false;
  }
}

export function accessExplanation(classification: DocumentClassification): string {
  switch (classification) {
    case 'Department Restricted':
      return 'Visible to department staff and management roles only.';
    case 'Management Restricted':
      return 'Restricted to Department Managers, the General Manager, and the Board.';
    case 'Board Restricted':
      return 'Restricted to Board Members and the General Manager. Use "View BES As → Board Member" to preview.';
    case 'Confidential':
      return 'Restricted to Audit and Board roles under access-controlled conditions. Use "View BES As → Auditor" to preview.';
    default:
      return '';
  }
}

export function roleDescription(role: AppRole): string {
  const map: Record<AppRole, string> = {
    Employee: 'Standard employee access — personal tasks, requests, and services only.',
    Secretary: 'Employee access plus document intake — routes correspondence and monitors department-restricted records.',
    Supervisor: 'Employee access plus approval authority over immediate direct reports.',
    'Department Manager': 'Full departmental access, approval authority, and workspace administration.',
    'General Manager': 'Enterprise-wide visibility, final approval authority, and executive reports.',
    'Board Member': 'Governance-level visibility including Board-restricted documents and enterprise reports.',
    'Process Owner': 'Visibility into assigned shared workflows and process performance metrics.',
    Auditor: 'Read access to audit engagements, findings, and confidential compliance records.',
    Administrator: 'Full technical administration and demonstration access to all modules.',
  };
  return map[role];
}
