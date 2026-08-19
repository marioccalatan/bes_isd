// Core domain types for the BENECO Enterprise System (BES) prototype.
// All data here is fictional / simulated for demonstration purposes only.

export type DepartmentId =
  | 'ISD' // Institutional Services Department
  | 'NSD' // Network Services Department
  | 'NNSD' // Non-Network Services Department
  | 'AUD' // Audit Department
  | 'CPD' // Corporate Planning Department
  | 'PGD'; // Power Generation Department

export interface Department {
  id: DepartmentId;
  name: string;
  shortName: string;
  mandate: string;
  managerId: string;
  employeeCount: number;
  units: string[];
  contactEmail: string;
  contactLocal: string;
  location: string;
  responsibilities: string[];
  color: string; // tailwind color token used for badges/charts
}

// Editable organizational chart — a position/reporting-line tree, distinct
// from the Employee/supervisorId relationship (which drives directory data).
// Used for the enterprise-wide chart on the Organization page and for each
// department's own chart on its detail page.
export interface OrgChartNode {
  id: string;
  label: string; // position title, e.g. "Network Services Department Manager"
  sublabel?: string; // grade/headcount, e.g. "[1] SG 19,20"
  position: { x: number; y: number };
}

export interface OrgChartEdge {
  id: string;
  source: string;
  target: string;
}

export interface OrgChart {
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
}

export type EmployeeStatus = 'Active' | 'On Leave' | 'Probationary' | 'Retired';

export interface Employee {
  id: string; // BENECO-00127
  name: string;
  firstName: string;
  lastName: string;
  position: string;
  departmentId: DepartmentId;
  unit: string;
  email: string;
  local: string;
  mobile: string;
  status: EmployeeStatus;
  dateHired: string; // ISO date
  location: string;
  supervisorId?: string;
  roles: string[]; // e.g. BES Institutional Lead, BAC Member
  avatarColor: string;
  isManager?: boolean;
}

export type CalendarLayer = string;

export interface CalendarEvent {
  id: string;
  title: string;
  layer: CalendarLayer;
  start: string; // ISO datetime
  end: string; // ISO datetime
  allDay?: boolean;
  location?: string;
  meetingLink?: string;
  description?: string;
  attendees?: string[];
  attachments?: { name: string; size: number; type?: string }[];
  visibility?: 'All employees' | 'Department only' | 'Specific people' | 'Me';
  visibleToUsernames?: string[];
  done?: boolean;
  doneAt?: string | null;
  doneBy?: string | null;
  departmentIds?: DepartmentId[];
  departmentId?: DepartmentId;
  officeAssignment?: string;
  editable: boolean; // false for org events, true for personal
  recurring?: 'weekly' | 'monthly' | 'none';
  ownerId?: string; // for personal events
  color: string;
  sourceName?: string;
}

export type NewsCategory =
  | 'News'
  | 'Memorandum'
  | 'Advisory'
  | 'Office Order'
  | 'Safety Bulletin'
  | 'Emergency Notice';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface NewsPost {
  id: string;
  category: NewsCategory;
  title: string;
  issuingOffice: string;
  date: string; // ISO date
  priority: Priority;
  recipients: string; // e.g. "All Employees", "Department Managers"
  body: string;
  hasAttachment: boolean;
  attachmentName?: string;
  requiresAcknowledgment: boolean;
  archived?: boolean;
  status: 'Published' | 'Scheduled' | 'Draft';
  scheduledFor?: string;
}

export interface NewsReadState {
  postId: string;
  read: boolean;
  bookmarked: boolean;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

export type WorkStatus =
  | 'Draft'
  | 'Submitted'
  | 'For Review'
  | 'Pending Approval'
  | 'Approved'
  | 'Returned'
  | 'Rejected'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled';

export interface ApprovalStep {
  id: string;
  stepName: string; // e.g. "Supervisor", "Department Manager"
  approverName: string;
  approverId?: string;
  status: 'Pending' | 'Approved' | 'Returned' | 'Rejected' | 'Skipped';
  actedAt?: string;
  remarks?: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface Comment {
  id: string;
  author: string;
  authorId?: string;
  timestamp: string;
  message: string;
  deleted?: boolean;
  parentCommentId?: string;
  replies?: Comment[];
}

export type ProcessType =
  | 'leave'
  | 'official-business'
  | 'gate-pass'
  | 'travel-order'
  | 'overtime'
  | 'personnel-request'
  | 'service-request-it'
  | 'service-request-facilities'
  | 'service-request-vehicle'
  | 'service-request-supplies'
  | 'service-request-records'
  | 'service-request-comms'
  | 'service-request-other'
  | 'attendance-correction'
  | 'procurement-request'
  | 'budget-request'
  | 'payment-request'
  | 'document-routing'
  | 'recruitment-request'
  | 'asset-request'
  | 'vehicle-request'
  | 'project-proposal'
  | 'legal-review'
  | 'data-request'
  | 'audit-response'
  | 'management-approval'
  | 'risk-compliance-submission'
  | 'support-ticket'
  | 'enhancement-request'
  | 'task-assignment';

export interface WorkItem {
  id: string; // reference number e.g. BES-LVE-2026-00231
  processType: ProcessType;
  title: string;
  requestorId: string;
  requestorName: string;
  departmentId: DepartmentId;
  dateSubmitted: string; // ISO date, empty-ish if draft
  status: WorkStatus;
  priority: Priority;
  purpose: string;
  fields: Record<string, unknown>; // process-specific payload
  attachments: string[];
  approvalChain: ApprovalStep[];
  comments: Comment[];
  activity: ActivityEntry[];
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  isTeamItem?: boolean; // visible under "Assigned to My Team" for managers
}

export interface AttendanceRecord {
  id: string;
  date: string;
  timeIn?: string;
  timeOut?: string;
  status: 'Present' | 'Late' | 'Undertime' | 'Absent' | 'On Leave' | 'Official Business' | 'Holiday';
  hoursRendered?: number;
  remarks?: string;
}

export interface Payslip {
  id: string;
  period: string; // "January 1-15, 2026"
  payDate: string;
  basicPay: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  netPay: number;
}

export type DocumentClassification =
  | 'Public to All Employees'
  | 'Department Restricted'
  | 'Management Restricted'
  | 'Board Restricted'
  | 'Confidential';

export interface PolicyDocument {
  id: string;
  title: string;
  category: string;
  version: string;
  owner: string;
  effectivityDate: string;
  reviewDate: string;
  status: 'Active' | 'Under Review' | 'Superseded' | 'Archived';
  classification: DocumentClassification;
  requiresAcknowledgment: boolean;
  relatedDocs?: string[];
  summary: string;
  versionHistory: { version: string; date: string; note: string }[];
}

export interface StrategicProject {
  id: string;
  title: string;
  departmentId: DepartmentId;
  status: 'On Track' | 'At Risk' | 'Delayed' | 'Completed';
  progress: number; // 0-100
  owner: string;
  startDate: string;
  targetDate: string;
  budget: number;
  description: string;
}

export type NotificationCategory =
  | 'Approval Required'
  | 'Request Update'
  | 'Memo'
  | 'Calendar Reminder'
  | 'Assignment'
  | 'Deadline'
  | 'System Message';

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  linkType?: 'work-item' | 'news' | 'event' | 'document' | 'none';
  linkId?: string;
}

export type ModuleStatus = 'Proposed' | 'In Development' | 'Active' | 'Deferred';

export interface BesModule {
  id: string;
  name: string;
  businessOwner: string;
  technicalOwner: string;
  departmentId: DepartmentId;
  status: ModuleStatus;
  priority: Priority;
  targetRelease: string;
  adoptionRate: number; // 0-100
  lastReviewDate: string;
  description: string;
}

// Department "Application Portal" tools (e.g. GIS, OMS, WIS) — a tool can be
// shared across multiple departments, each with its own access level.
export type ToolAccessLevel = 'ADMIN' | 'NEW' | 'VIEW' | 'EDIT' | 'OPEN' | 'SOON' | 'EXISTING';

export interface ToolAccessGrant {
  departmentId: DepartmentId;
  level: ToolAccessLevel;
  note?: string; // optional department-specific override of the tile description
}

export interface AppTool {
  code: string; // short code e.g. "WIS"
  name: string; // full name e.g. "Warehouse Inventory System"
  description: string;
  iconKey: string; // maps to a Lucide icon in lib/toolIcons.ts
  ownerDepartmentId: DepartmentId;
  access: ToolAccessGrant[];
}

// Personal file storage — each employee gets a folder tree, capped by an
// administrator-configurable per-user quota.
export type StorageItemType = 'file' | 'folder';

export interface StorageItem {
  id: string;
  name: string;
  type: StorageItemType;
  parentId: string | null; // null = root of the owner's storage
  ownerId: string; // Employee.id
  sizeBytes: number; // 0 for folders
  mimeType?: string; // files only
  createdAt: string; // ISO datetime
  modifiedAt: string; // ISO datetime
}

export interface StorageQuota {
  employeeId: string;
  quotaBytes: number;
}

// ISO 9001:2015 Quality Management System — controlled document registry.
// Mirrors BENECO's actual QMS document-control model: numbered, revision-
// controlled Procedure Manuals / Work Instructions / Guidelines / Forms,
// each carrying a Prepared By / Reviewed & Approved By / Noted By (ISO
// Officer) sign-off chain.
export type QmsDocType = 'Procedure Manual' | 'Work Instruction' | 'Guideline' | 'Form';
export type QmsDocStatus = 'Controlled' | 'Under Revision' | 'Obsolete';

export type QmsFlowNodeType = 'start' | 'end' | 'process' | 'decision';

export interface QmsFlowNode {
  id: string;
  type: QmsFlowNodeType;
  label: string;
  responsibility?: string; // "Responsibility" swimlane column
  interfaceRef?: string; // "Interface/Reference" column
  position: { x: number; y: number };
}

export interface QmsFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  label?: string; // e.g. "YES" / "NO"
}

export interface QmsFlowchart {
  nodes: QmsFlowNode[];
  edges: QmsFlowEdge[];
}

export interface QmsDocument {
  id: string;
  code: string; // e.g. "PM-NSD-01"
  title: string;
  type: QmsDocType;
  departmentId: DepartmentId;
  revisionNo: string;
  effectiveDate: string; // ISO date
  pageCount: number;
  status: QmsDocStatus;
  objective: string;
  scope: string;
  definitions: { term: string; meaning: string }[];
  referenceRecords: string[]; // e.g. "F-NSD-13 — Job Order"
  preparedByName: string;
  preparedByPosition: string;
  approvedByName: string;
  approvedByPosition: string;
  notedByName: string; // ISO Officer
  notedByPosition: string;
  flowchart: QmsFlowchart; // Section 4.0 Procedure Flowchart
}

// General Manager Home KPI dashboard — technical, non-technical, and
// financial performance indicators, toggled on/off from Enterprise Home.
export interface SubstationCapacity {
  name: string;
  units: string; // e.g. "1 x 20 MVA"
  capacityMVA: number;
  peakLoadMVA: number;
}

export interface PesoRate {
  customerClass: string;
  rate: number; // PHP per kWh
}

export interface CustomerRequestVolume {
  category: string;
  count: number;
}

export interface MonthlyTrendPoint {
  month: string; // e.g. "Mar"
  value: number;
}

export interface GmKpiData {
  asOf: string; // ISO date
  technical: {
    systemsLossPct: number;
    systemsLossCapPct: number; // NEA-allowed cap for context
    systemsLossTrend: MonthlyTrendPoint[];
    powerFactor: number;
    loadFactor: number;
    substations: SubstationCapacity[];
    miniHydroCapacityMW: number;
    energyProducedMWh: number;
    saifi: number;
    saidi: number;
    maifi: number;
  };
  nonTechnical: {
    meterReadingCompletionPct: number;
    manpowerCount: number;
    ascAverageDays: number;
    customerRequests: CustomerRequestVolume[];
  };
  financial: {
    collectionEfficiencyPct: number;
    collectionEfficiencyTrend: MonthlyTrendPoint[];
    currentCollectionsPhp: number;
    pesoRates: PesoRate[];
    debtRatioPct: number;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  category: 'Authentication' | 'Data Change' | 'Access' | 'Administration' | 'Workflow';
  ipAddress: string;
}

export interface SupportTicket {
  id: string;
  type: 'Support' | 'Feedback' | 'Problem Report' | 'Enhancement Request';
  subject: string;
  description: string;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  submittedBy: string;
  dateSubmitted: string;
}

export type AppRole =
  | 'Employee'
  | 'Secretary'
  | 'Supervisor'
  | 'Department Manager'
  | 'General Manager'
  | 'Board Member'
  | 'Process Owner'
  | 'Auditor'
  | 'Administrator';

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'starred' | 'trash';

export interface EmailMessage {
  id: string;
  threadId: string;
  fromId: string;
  fromName: string;
  toNames: string[];
  ccNames: string[];
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
  starred: boolean;
  folder: EmailFolder;
  attachments: string[];
  inReplyTo?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface ChatConversation {
  id: string;
  participantIds: string[];
  participantNames: string[];
  isGroup: boolean;
  title?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  employeeId: string;
  position: string;
  departmentId: DepartmentId;
  role: AppRole;
  additionalRoles: string[];
  workLocation: string;
  employmentStatus: EmployeeStatus;
  email: string;
}
