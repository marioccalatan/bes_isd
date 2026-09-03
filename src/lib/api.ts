import type { AppTool, CalendarEvent, Comment, PolicyDocumentType, PolicyRecord, PolicyRecordNature, PolicyRecordStatus, Priority, RecruitmentComment, RecruitmentRecord, RecruitmentStatus, WorkItem } from '@/lib/types';

export interface ApiUser {
  id: string; employeeNo: string; username: string; email: string; firstName: string;
  middleName?: string | null; lastName: string; suffix?: string | null; name: string; role: string; position?: string | null;
  designation?: string | null; departmentCode?: string | null; unitName?: string | null; mobileNo?: string | null;
  employmentStatus?: string | null; accountStatus?: string | null; dateHired?: string | null;
  workLocation?: string | null; profilePhoto?: string | null;
  roles?: string[];
}

export interface AdminUser {
  id: string;
  employeeNo: string;
  username: string;
  email: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  name: string;
  position?: string | null;
  departmentCode?: string | null;
  unitName?: string | null;
  mobileNo?: string | null;
  employmentStatus: string;
  accountStatus: string;
  role: string;
  roles: string[];
  dateHired?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  designation?: string | null;
}

export interface DirectoryUser {
  id: string;
  employeeNo: string;
  username: string;
  name: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  position?: string | null;
  departmentCode?: string | null;
  unitName?: string | null;
}

export interface HrEmployee {
  employeeNo: string;
  lastName: string;
  firstName: string;
  middleName?: string | null;
  currentPositionType?: string | null;
  officialPositionType?: string | null;
  positionLevel?: string | null;
  dateHired?: string | null;
  departmentId?: string | null;
  departmentShort?: string | null;
  departmentName?: string | null;
  jobLevelId?: string | null;
  jobLevelDescription?: string | null;
}

export interface OrganizationNode {
  id: string;
  parentId?: string | null;
  type: 'DEPARTMENT' | 'OFFICE' | 'POSITION';
  code?: string | null;
  deptId?: string | null;
  oId?: string | null;
  name: string;
  departmentCode: string;
  officeShort?: string | null;
  positionType1?: string | null;
  positionType2?: string | null;
  level: number;
  quantity: number;
  isPlantilla?: boolean | null;
  purpose?: string | null;
  children: OrganizationNode[];
}

export interface HrServiceEvidence { id: string; fileName: string; mimeType: string; fileSize: number; createdAt?: string }
export interface HrServiceRecord {
  id: string; employeeNo: string; positionTitle: string; positionLevel?: string | null; monthlySalary?: number | null;
  effectiveStart: string; effectiveEnd?: string | null; remarks?: string | null; evidence: HrServiceEvidence[];
}

export interface PerformanceTarget {
  id: string;
  description: string;
  measureType: 'COUNT' | 'PERCENTAGE' | 'MILESTONE' | 'COMPLIANCE';
  targetValue: number;
  unit: string;
  weight: number;
  dueDate?: string | null;
  actualValue?: number | null;
  status: string;
  accomplishments?: PerformanceAccomplishment[];
}

export interface PerformanceEvidence { id: string; name: string; mimeType: string; size: number }
export interface PerformanceAccomplishment { id: string; description: string; quantity: number; accomplishedOn?: string | null; createdAt?: string; evidence: PerformanceEvidence[] }

export interface PerformancePlan {
  id: string;
  employeeUserId: string;
  employeeName: string;
  employeeNo: string;
  cycleLabel: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  targets: PerformanceTarget[];
}

export interface PerformanceAssignment {
  id: string;
  positionId: string;
  employeeUserId: string;
  detailOrder?: string | null;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
  mode: 'INCLUDE' | 'EXCLUDE';
  currentLevel?: number | null;
}

export interface EmployeeSkillCheck {
  employeeUserId: string;
  positionId: string;
  dutyId: string;
  attained: boolean;
  level2: boolean;
  level3: boolean;
  level4: boolean;
  levels?: number[];
  remarks?: string | null;
  assessedAt?: string | null;
}

export interface PositionDuty {
  id: string;
  kra: string;
  kraWeight: number;
  description: string;
  applicableLevels: string[];
  competency: string;
  levelRequirement: string;
}

export interface PositionDrPl {
  positionId: string;
  purpose: string;
  employmentLevel: string;
  reportsTo: string;
  areaOfWork: string;
  positionLevels: string[];
  maxLevel: number;
  competencyNotes: { level: number; name: string; description: string }[];
  categories?: string[];
  sourceDocument?: string | null;
  duties: PositionDuty[];
}

export interface RolePermissionConfig {
  factors: string[];
  roles: { code: string; name: string }[];
  permissions: { code: string; name: string }[];
  matrix: { roleCode: string; permissionCode: string; granted: boolean }[];
  assignments: {
    username: string;
    name: string;
    roleCode: string;
    departmentCode?: string | null;
    unitName?: string | null;
    note?: string | null;
  }[];
}

export interface UserRoleAssignmentInput {
  roleCode: string;
  departmentCode?: string | null;
  unitName?: string | null;
  note?: string | null;
}

export type OrgPositionClass = 'DEPARTMENT_MANAGER' | 'DEPARTMENT_SECRETARY' | 'OFFICE_SECRETARY' | 'SUPERVISOR' | 'RAF';
export interface OrgPosition { id: string; title: string; employeeClass: OrgPositionClass; level?: number; quantity?: number; isPlantilla?: boolean; purpose?: string | null }
export interface OrgOffice { id: string; name: string; shortName?: string | null; parentOfficeId?: string | null; positions: OrgPosition[] }
export interface OrgDepartment { id: string; code: string; name: string; positions: OrgPosition[]; offices: OrgOffice[] }
export interface HrPositionRequirement { id: string; positionLevel: number; subject: string; qualificationLevel?: string | null; description: string }
export interface HrProficiencyLevel { profLevel: number; description: string }

export async function fetchHrProficiencyLevels(token: string) {
  const result = await apiRequest<{ items: HrProficiencyLevel[] }>('/api/hro/proficiency-levels', { headers: { authorization: `Bearer ${token}` } });
  return result.items;
}

export async function saveHrProficiencyLevel(token: string, input: HrProficiencyLevel, originalLevel?: number) {
  return apiRequest<{ ok: true }>(originalLevel == null ? '/api/hro/proficiency-levels' : `/api/hro/proficiency-levels/${originalLevel}`, { method: originalLevel == null ? 'POST' : 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function deleteHrProficiencyLevel(token: string, profLevel: number) {
  return apiRequest<{ ok: true }>(`/api/hro/proficiency-levels/${profLevel}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export type HrPositionDetailKind = 'qualifications' | 'duties' | 'specifications';

export async function fetchHrPositionRequirements(token: string, positionId: string, kind: HrPositionDetailKind) {
  const result = await apiRequest<{ items: HrPositionRequirement[] }>(`/api/hro/positions/${encodeURIComponent(positionId)}/${kind}`, { headers: { authorization: `Bearer ${token}` } });
  return result.items;
}

export async function saveHrPositionRequirement(token: string, positionId: string, kind: HrPositionDetailKind, input: Omit<HrPositionRequirement, 'id'> & { id?: string }) {
  return apiRequest<{ ok: true }>(input.id ? `/api/hro/${kind}/${input.id}` : `/api/hro/positions/${encodeURIComponent(positionId)}/${kind}`, { method: input.id ? 'PUT' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function deleteHrPositionRequirement(token: string, kind: HrPositionDetailKind, id: string) {
  return apiRequest<{ ok: true }>(`/api/hro/${kind}/${id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function fetchRegistrationOptions() {
  const result = await apiRequest<{ departments: OrgDepartment[] }>('/api/auth/registration-options');
  return result.departments;
}

export async function fetchOrgStructure(token: string) {
  const result = await apiRequest<{ departments: OrgDepartment[] }>('/api/admin/org-structure', { headers: { authorization: `Bearer ${token}` } });
  return result.departments;
}

export async function fetchToolRegistry(token: string) {
  const result = await apiRequest<{ tools: Pick<AppTool, 'code' | 'name' | 'ownerDepartmentId' | 'access' | 'taskSubjects' | 'status'>[] }>('/api/tools', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.tools;
}

export async function saveToolRegistryEntry(token: string, tool: AppTool) {
  return apiRequest<{ ok: true }>(`/api/admin/tools/${encodeURIComponent(tool.code)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: tool.name,
      ownerDepartmentId: tool.ownerDepartmentId,
      access: tool.access,
      taskSubjects: tool.taskSubjects ?? [],
      status: tool.status ?? 'ENABLED',
    }),
  });
}

export async function fetchModuleRegistry(token: string) {
  const result = await apiRequest<{ modules: { path: string; label: string; adminOnly: boolean; departmentIds: string[] }[] }>('/api/modules', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.modules;
}

export async function saveModuleRegistryAccess(token: string, access: Record<string, string[]>) {
  return apiRequest<{ ok: true }>('/api/admin/modules', {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ access }),
  });
}

export async function saveOrgEntity(token: string, input: Record<string, unknown>) {
  return apiRequest<{ ok: true }>('/api/admin/org-structure', {
    method: input.id ? 'PUT' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export interface OracleConnectionInput {
  connectionName: string;
  connectionType: 'Basic';
  host: string;
  port: string;
  serviceName: string;
  mode: 'serviceName' | 'sid';
  username: string;
  password: string;
  savePassword: boolean;
}

export interface DatabaseSyncTable {
  tableName: string;
  rowCount: number;
}

export interface DatabaseSyncResult {
  ok: true;
  startedAt: string;
  finishedAt: string;
  tables: { tableName: string; rowCount: number; columns: number; addedColumns?: string[]; direction?: string; note?: string }[];
}

export interface DatabaseSchemaSyncResult {
  ok: true;
  startedAt: string;
  finishedAt: string;
  tables: { tableName: string; created: boolean; addedColumns: string[] }[];
}

export interface DatabaseRuntimeStatus {
  activeDatabase: 'local' | 'server';
  local: { user: string; connectString: string };
  server: { user: string; connectString: string } | null;
  database?: string;
  container?: string;
  schema?: string;
}

export interface CalendarTaskInput {
  calendarEventId: string;
  controlNumber?: string;
  title: string;
  description?: string;
  assigneeUsername: string;
  departmentId?: string;
  officeAssignment?: string;
  taskSubject?: string;
  attachments?: (string | NonNullable<CalendarEvent['attachments']>[number])[];
  municipality?: string;
  barangay?: string;
  address?: string;
  priority: Priority;
  dueDate?: string;
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body as T;
}

export async function fetchAdminUsers() {
  const result = await apiRequest<{ users: AdminUser[] }>('/api/admin/users');
  return result.users;
}

export async function fetchUserDirectory(token?: string) {
  const result = await apiRequest<{ users: DirectoryUser[] }>('/api/users/directory', token ? {
    headers: { authorization: `Bearer ${token}` },
  } : undefined);
  return result.users;
}

export async function updateAdminUser(userId: string, user: Partial<AdminUser> & { roleAssignments?: UserRoleAssignmentInput[] }) {
  return apiRequest<{ ok: true }>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(user),
  });
}

export async function deleteAdminUser(token: string, userId: string) {
  return apiRequest<{ ok: true }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function fetchRolePermissionConfig() {
  return apiRequest<RolePermissionConfig>('/api/admin/roles-permissions');
}

export interface PolicyRecordInput {
  title: string;
  documentNumber: string;
  revisionNumber: string;
  effectivityDate: string;
  contents: string;
  nature: PolicyRecordNature;
  documentType: PolicyDocumentType;
  status: PolicyRecordStatus;
  originalDocumentNumber?: string;
}

export async function fetchPerformancePlans(token: string) {
  const result = await apiRequest<{ plans: PerformancePlan[] }>('/api/performance-plans', { headers: { authorization: `Bearer ${token}` } });
  return result.plans;
}

export async function createPerformancePlan(token: string, input: { employeeUserId: string; cycleLabel: string; periodStart: string; periodEnd: string }) {
  return apiRequest<{ plan: PerformancePlan }>('/api/performance-plans', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function updatePerformancePlan(token: string, planId: string, input: { cycleLabel: string; periodStart: string; periodEnd: string; status: string }) {
  return apiRequest<{ plan: PerformancePlan }>(`/api/performance-plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function createPerformanceTarget(token: string, planId: string, input: { description: string; measureType: PerformanceTarget['measureType']; targetValue: number; unit: string; weight: number; dueDate?: string }) {
  return apiRequest<{ target: PerformanceTarget }>(`/api/performance-plans/${encodeURIComponent(planId)}/targets`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function updatePerformanceTarget(token: string, planId: string, targetId: string, input: { description: string; measureType: PerformanceTarget['measureType']; targetValue: number; unit: string; weight: number; dueDate?: string }) {
  return apiRequest<{ target: PerformanceTarget }>(`/api/performance-plans/${encodeURIComponent(planId)}/targets/${encodeURIComponent(targetId)}`, {
    method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function createPerformanceAccomplishment(token: string, targetId: string, input: { description: string; quantity: number; accomplishedOn?: string }) {
  return apiRequest<{ accomplishment: PerformanceAccomplishment }>(`/api/performance-targets/${encodeURIComponent(targetId)}/accomplishments`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function uploadPerformanceEvidence(token: string, accomplishmentId: string, file: File) {
  const response = await fetch(`/api/performance-accomplishments/${encodeURIComponent(accomplishmentId)}/evidence`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to upload evidence.');
  return body as { evidence: PerformanceEvidence };
}

export async function downloadPerformanceEvidence(token: string, evidenceId: string, fileName: string) {
  const response = await fetch(`/api/performance-evidence/${encodeURIComponent(evidenceId)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Unable to download evidence.'); }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
  URL.revokeObjectURL(url);
}

export async function fetchPerformanceAssignments(token: string) {
  const result = await apiRequest<{ assignments: PerformanceAssignment[] }>('/api/performance-assignments', { headers: { authorization: `Bearer ${token}` } });
  return result.assignments;
}

export async function createPerformanceAssignment(token: string, input: { positionId: string; employeeUserId: string; currentLevel: string; detailOrder?: string; effectiveStart?: string; effectiveEnd?: string }) {
  return apiRequest<{ assignment: PerformanceAssignment }>('/api/performance-assignments', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function removePerformanceEmployee(token: string, positionId: string, employeeUserId: string) {
  return apiRequest<{ assignment: PerformanceAssignment }>(`/api/performance-assignments/${encodeURIComponent(positionId)}/${encodeURIComponent(employeeUserId)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  });
}

export async function fetchPositionDrPl(token: string) {
  const result = await apiRequest<{ profiles: PositionDrPl[] }>('/api/position-dr-pl', { headers: { authorization: `Bearer ${token}` } });
  return result.profiles;
}

export async function updatePositionDrPl(token: string, positionId: string, input: { purpose: string; employmentLevel: string; reportsTo: string; areaOfWork: string; maxLevel: number; competencyNotes: { level: number; name: string; description: string }[]; categories: string[]; duties: PositionDuty[] }) {
  return apiRequest<{ profile: PositionDrPl }>(`/api/position-dr-pl/${encodeURIComponent(positionId)}`, {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function fetchEmployeeSkillChecks(token: string) {
  const result = await apiRequest<{ checks: EmployeeSkillCheck[] }>('/api/employee-skill-checks', { headers: { authorization: `Bearer ${token}` } });
  return result.checks;
}

export async function updateEmployeeSkillCheck(token: string, input: { employeeUserId: string; positionId: string; dutyId: string; levels: number[]; remarks?: string }) {
  return apiRequest<{ check: EmployeeSkillCheck }>('/api/employee-skill-checks', {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function deleteOrgEntity(token: string, entity: 'office', id: string) {
  return apiRequest<{ ok: true }>(`/api/admin/org-structure/${entity}/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  });
}

export async function fetchFleetVehicles<T>(token: string) {
  const result = await apiRequest<{ vehicles: T; updatedAt?: string }>('/api/fleet/vehicles', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.vehicles;
}

export async function fetchFleetMasterVehicles<T>(token: string) {
  const result = await apiRequest<{ vehicles: T }>('/api/fleet/master-vehicles', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.vehicles;
}

export async function fetchFleetMaintenanceSchedule<T>(token: string) {
  const result = await apiRequest<{ vehicles: T }>('/api/fleet/maintenance-schedule', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.vehicles;
}

export async function fetchFleetMasterVehicleActivity<T>(token: string, vehicleMasterId: string) {
  return apiRequest<T>(`/api/fleet/master-vehicles/${encodeURIComponent(vehicleMasterId)}/activity`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function createFleetMasterSchedule(token: string, input: { vehicleMasterId: string; scheduleType: 'Preventive Maintenance' | 'Registration Renewal'; startDate: string; endDate: string; notes?: string }) {
  return apiRequest<{ schedule: { id: string } }>('/api/fleet/master-schedules', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}
export async function updateFleetRenewalScheduleStatus(token: string, scheduleUid: string, status: 'Scheduled' | 'In Progress' | 'Registered') {
  return apiRequest<{ ok: true }>(`/api/fleet/master-schedules/${encodeURIComponent(scheduleUid)}/status`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
}

export async function updateFleetPreventiveMaintenance(token: string, scheduleUid: string, input: { status: 'Scheduled' | 'Completed'; actualDate?: string }) {
  return apiRequest<{ ok: true }>(`/api/fleet/master-schedules/${encodeURIComponent(scheduleUid)}/maintenance`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function createFleetMasterInspection(token: string, input: { vehicleMasterId: string; inspectionDate: string; inspectedBy: string; inspectionStatus: string; items: Array<{ id: string; activity: string; status: string; findings?: string; actionTaken?: string; recommendation?: string; annotations?: unknown[]; snapshot?: { name: string; dataUrl: string }; photos?: { name: string; dataUrl: string }[] }> }) {
  return apiRequest<{ inspection: { id: string } }>('/api/fleet/master-inspections', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}
export async function fetchFleetMasterInspection<T>(token: string, inspectionUid: string) {
  return apiRequest<{ inspection: T }>(`/api/fleet/master-inspections/${encodeURIComponent(inspectionUid)}`, { headers: { authorization: `Bearer ${token}` } }).then((result) => result.inspection);
}
export async function updateFleetMasterInspection(token: string, inspectionUid: string, input: { inspectionDate: string; inspectedBy: string; inspectionStatus: string; items: Array<{ id: string; activity: string; status: string; findings?: string; actionTaken?: string; recommendation?: string; annotations?: unknown[]; snapshot?: { name: string; dataUrl: string }; photos?: { name: string; dataUrl: string }[] }> }) {
  return apiRequest<{ ok: true }>(`/api/fleet/master-inspections/${encodeURIComponent(inspectionUid)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export type FleetRenewalReceipt = { orNumber?: string; receiptDate?: string; amountPaid?: number; issuingOffice?: string; attachment?: { name: string; type: string; size: number } | null };
export async function fetchFleetRenewalReceipt(token: string, scheduleUid: string) {
  return apiRequest<{ receipt: FleetRenewalReceipt | null }>(`/api/fleet/renewal-receipts/${encodeURIComponent(scheduleUid)}`, { headers: { authorization: `Bearer ${token}` } });
}
export async function saveFleetRenewalReceipt(token: string, scheduleUid: string, input: Omit<FleetRenewalReceipt, 'attachment'> & { attachment?: { name: string; dataUrl: string } }) {
  return apiRequest<{ ok: true }>(`/api/fleet/renewal-receipts/${encodeURIComponent(scheduleUid)}`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function downloadFleetRenewalReceiptAttachment(token: string, scheduleUid: string, fileName: string) {
  const response = await fetch(`/api/fleet/renewal-receipts/${encodeURIComponent(scheduleUid)}/attachment`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Unable to download the renewal receipt attachment.');
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function deleteFleetRenewalReceipt(token: string, scheduleUid: string) {
  return apiRequest<{ ok: true }>(`/api/fleet/renewal-receipts/${encodeURIComponent(scheduleUid)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function saveFleetVehicles<T>(token: string, vehicles: T[]) {
  return apiRequest<{ ok: true }>('/api/fleet/vehicles', {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ vehicles }),
  });
}

export async function fetchFleetVehicleModels<T>(token: string) {
  const result = await apiRequest<{ models: T }>('/api/fleet/models', { headers: { authorization: `Bearer ${token}` } });
  return result.models;
}

export async function saveFleetVehicleModels<T>(token: string, models: T[]) {
  return apiRequest<{ ok: true }>('/api/fleet/models', {
    method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ models }),
  });
}

export interface CsrRequest {
  id: string;
  dateRequested: string;
  programType: string;
  requestee: string;
  designation: string;
  organization: string;
  registrationDetails: string;
  sector: string;
  location: string;
  barangay: string;
  municipality: string;
  district: string;
  projectDetails: string;
  projectRequirement: string;
  pendingReason: string;
  withLetterReply: boolean;
  additionalRemarks: string;
  status: 'For evaluation' | 'Pending' | 'Completed';
  approvalStatus: 'Approved' | 'Disapproved' | 'For Evaluation';
  evaluationResult: Array<'Within CSR Policy' | 'Not Within CSR Policy'>;
  evaluatedBy: string;
  dateApproved: string;
  amountFunding: string;
  pjrs: string;
  actualProjectCost: string;
  updatedAt?: string;
}

export interface BarangayLocation {
  municipality: string;
  barangay: string;
  district: string;
}

export interface CsrProjectEvent {
  id: string;
  date: string;
  projectEvent: string;
  inspectedBy: string;
  createdAt?: string;
}

export async function fetchBarangayLocations(token: string) {
  const result = await apiRequest<{ locations: BarangayLocation[] }>('/api/member-programs/locations', { headers: { authorization: `Bearer ${token}` } });
  return result.locations;
}

export async function fetchCsrSectors(token: string) {
  const result = await apiRequest<{ sectors: string[] }>('/api/member-programs/csr-sectors', { headers: { authorization: `Bearer ${token}` } });
  return result.sectors;
}

export async function createCsrSector(token: string, sector: string) {
  return apiRequest<{ sector: string }>('/api/member-programs/csr-sectors', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ sector }),
  });
}

export async function fetchCsrRequests(token: string) {
  const result = await apiRequest<{ requests: CsrRequest[] }>('/api/member-programs/csr', { headers: { authorization: `Bearer ${token}` } });
  return result.requests;
}

export async function saveCsrRequest(token: string, request: Omit<CsrRequest, 'id' | 'updatedAt'>, id?: string) {
  return apiRequest<{ id?: string; ok?: true }>(id ? `/api/member-programs/csr/${encodeURIComponent(id)}` : '/api/member-programs/csr', {
    method: id ? 'PATCH' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(request),
  });
}

export async function deleteCsrRequest(token: string, id: string) {
  return apiRequest<{ ok: true }>(`/api/member-programs/csr/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export interface CsrAttachment { id: string; fileName: string; mimeType: string; fileSize: number; createdAt?: string }

export type MemberProgramStatus = 'Planned' | 'Ongoing' | 'Completed' | 'On Hold' | 'Cancelled';
export interface MemberProgram { id: string; parentId: string | null; name: string; description: string; startDate: string; endDate: string; status: MemberProgramStatus }
export type MemberProgramInput = Omit<MemberProgram, 'id'>;

export async function fetchMemberPrograms(token: string) {
  const result = await apiRequest<{ programs: MemberProgram[] }>('/api/member-programs/programs', { headers: { authorization: `Bearer ${token}` } });
  return result.programs;
}
export async function saveMemberProgram(token: string, input: MemberProgramInput, id?: string) {
  return apiRequest<{ id?: string; ok?: true }>(id ? `/api/member-programs/programs/${encodeURIComponent(id)}` : '/api/member-programs/programs', { method: id ? 'PATCH' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function deleteMemberProgram(token: string, id: string) {
  return apiRequest<{ ok: true }>(`/api/member-programs/programs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export interface MemberOperationsActivity { id: string; name: string; description: string; frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Custom'; weekdays: string[]; timeFrom: string; timeTo: string; uniformTime?: boolean; dayTimes?: Record<string, { from: string; to: string }> }
export interface MemberOperationsProgram { id: string; title: string; children: MemberOperationsProgram[]; activities: MemberOperationsActivity[] }
export async function fetchMemberOperations(token: string) {
  const result = await apiRequest<{ programs: MemberOperationsProgram[] }>('/api/member-programs/operations', { headers: { authorization: `Bearer ${token}` } });
  return result.programs;
}
export async function saveMemberOperations(token: string, programs: MemberOperationsProgram[]) {
  return apiRequest<{ ok: true }>('/api/member-programs/operations', { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ programs }) });
}

export async function fetchCsrAttachments(token: string, csrId: string) {
  const result = await apiRequest<{ attachments: CsrAttachment[] }>(`/api/member-programs/csr/${encodeURIComponent(csrId)}/attachments`, { headers: { authorization: `Bearer ${token}` } });
  return result.attachments;
}

export async function uploadCsrAttachment(token: string, csrId: string, file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error('Unable to read attachment.')); reader.readAsDataURL(file); });
  return apiRequest<{ id: string }>(`/api/member-programs/csr/${encodeURIComponent(csrId)}/attachments`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ fileName: file.name, mimeType: file.type, dataUrl }) });
}

export async function deleteCsrAttachment(token: string, csrId: string, attachmentId: string) {
  return apiRequest<{ ok: true }>(`/api/member-programs/csr/${encodeURIComponent(csrId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function downloadCsrAttachment(token: string, csrId: string, attachment: CsrAttachment) {
  const response = await fetch(`/api/member-programs/csr/${encodeURIComponent(csrId)}/attachments/${encodeURIComponent(attachment.id)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Unable to download attachment.');
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = attachment.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function fetchCsrProjectEvents(token: string, csrId: string) {
  const result = await apiRequest<{ events: CsrProjectEvent[] }>(`/api/member-programs/csr/${encodeURIComponent(csrId)}/events`, { headers: { authorization: `Bearer ${token}` } });
  return result.events;
}

export async function addCsrProjectEvent(token: string, csrId: string, event: Omit<CsrProjectEvent, 'id' | 'createdAt'>) {
  return apiRequest<{ id: string }>(`/api/member-programs/csr/${encodeURIComponent(csrId)}/events`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(event),
  });
}

export async function uploadFleetVehicleModel(token: string, vehicleId: string, file: File) {
  const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/model`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': file.type || 'model/gltf-binary', 'x-file-name': encodeURIComponent(file.name) },
    body: file,
  });
  const result = await response.json().catch(() => ({})) as { model?: { name: string; type: string; size: number }; error?: string };
  if (!response.ok || !result.model) throw new Error(result.error || `Unable to upload the 3D model (${response.status}).`);
  return result.model;
}

export async function fetchFleetVehicleModel(token: string, vehicleId: string) {
  const response = await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/model`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || `Unable to load the 3D model (${response.status}).`);
  }
  return response.blob();
}

export async function deleteFleetVehicleModel(token: string, vehicleId: string) {
  return apiRequest<{ ok: true }>(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/model`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export interface BfmFacility {
  id: string;
  parentId?: string;
  name: string;
  type: string;
  description: string;
  location: string;
  sortOrder: number;
  updatedBy: string;
  updatedAt: string;
}

export interface BfmPersonnel {
  id: string;
  name: string;
  employeeNo: string;
  position: string;
  contact: string;
  updatedBy: string;
  updatedAt: string;
}

export type BfmTodoStatus = 'Pending' | 'In Progress' | 'Completed' | 'Deferred';
export interface BfmTodo {
  id: string;
  facilityId: string;
  title: string;
  description: string;
  category: string;
  frequency: string;
  customDays: number[];
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  status: BfmTodoStatus;
  dueDate: string;
  lastCompletedAt: string;
  workerIds: string[];
  updatedBy: string;
  updatedAt: string;
}

export interface BfmActivity {
  id: string;
  todoId: string;
  previousStatus: string;
  newStatus: string;
  note: string;
  performedForId?: string;
  performedForName?: string;
  workDate: string;
  updatedBy: string;
  createdAt: string;
}

export interface BfmWorkDetail {
  id: string;
  todoId: string;
  workDate: string;
  findings: string;
  actionTaken: string;
  materialsUsed: string;
  recommendation: string;
  convertedTaskId?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface BfmOperationsData {
  facilities: BfmFacility[];
  personnel: BfmPersonnel[];
  todos: BfmTodo[];
  activity: BfmActivity[];
  workDetails: BfmWorkDetail[];
  projects: BfmProject[];
  canManage?: boolean;
}

export interface BfmProject {
  id: string; facilityId: string; title: string; description: string; category: string;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent'; status: 'Planned' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
  budgetAmount: number | null; budgetStatus: 'Available' | 'For Realignment' | 'For Budgeting';
  startDate: string; targetDate: string; workerIds: string[]; updatedBy: string; updatedAt: string;
}

export async function fetchBfmOperations(token: string) {
  return apiRequest<BfmOperationsData>('/api/bfm/operations', { headers: { authorization: `Bearer ${token}` } });
}

export async function fetchBfmProjects(token: string) {
  return apiRequest<BfmOperationsData>('/api/bfm/projects', { headers: { authorization: `Bearer ${token}` } });
}

export async function createBfmFacility(token: string, input: { parentId?: string; name: string; type: string; description: string; location: string; scope?: 'Operations' | 'Projects' }) {
  return apiRequest<BfmOperationsData>('/api/bfm/facilities', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function updateBfmFacility(token: string, facilityId: string, input: { name: string; type: string; description: string; location: string }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/facilities/${encodeURIComponent(facilityId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function deleteBfmFacility(token: string, facilityId: string) {
  return apiRequest<BfmOperationsData>(`/api/bfm/facilities/${encodeURIComponent(facilityId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function createBfmProjectFacility(token: string, input: { parentId?: string; name: string; type: string; description: string; location: string }) {
  return createBfmFacility(token, { ...input, scope: 'Projects' });
}

export async function updateBfmProjectFacility(token: string, facilityId: string, input: { name: string; type: string; description: string; location: string }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/facilities/${encodeURIComponent(facilityId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ ...input, scope: 'Projects' }) });
}

export async function deleteBfmProjectFacility(token: string, facilityId: string) {
  return apiRequest<BfmOperationsData>(`/api/bfm/facilities/${encodeURIComponent(facilityId)}?scope=Projects`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function createBfmPersonnel(token: string, input: { name: string; employeeNo: string; position: string; contact: string }) {
  return apiRequest<BfmOperationsData>('/api/bfm/personnel', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function createBfmTodo(token: string, input: { facilityId: string; title: string; description: string; category: string; frequency: string; customDays: number[]; priority: string; dueDate: string; workerIds: string[] }) {
  return apiRequest<BfmOperationsData>('/api/bfm/todos', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function updateBfmTodo(token: string, todoId: string, input: { title: string; description: string; category: string; frequency: string; customDays: number[]; priority: string; dueDate: string; workerIds: string[] }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/todos/${encodeURIComponent(todoId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function deleteBfmTodo(token: string, todoId: string) {
  return apiRequest<BfmOperationsData>(`/api/bfm/todos/${encodeURIComponent(todoId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function updateBfmTodoStatus(token: string, todoId: string, input: { status: BfmTodoStatus; workerId?: string; note?: string; workDate?: string }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/todos/${encodeURIComponent(todoId)}/status`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function saveBfmWorkDetails(token: string, todoId: string, input: { workDate: string; findings: string; actionTaken: string; materialsUsed: string; recommendation: string; convertedTaskId?: string }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/todos/${encodeURIComponent(todoId)}/work-details`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function createBfmProject(token: string, input: { facilityId: string; title: string; description: string; category: string; priority: string; status: string; startDate: string; targetDate: string; budgetAmount?: number | null; budgetStatus?: string; workerIds: string[] }) {
  return apiRequest<BfmOperationsData>('/api/bfm/projects', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}

export async function updateBfmProject(token: string, projectId: string, input: { title: string; description: string; category: string; priority: string; status: string; startDate: string; targetDate: string; budgetAmount?: number | null; budgetStatus?: string; workerIds: string[] }) {
  return apiRequest<BfmOperationsData>(`/api/bfm/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function deleteBfmProject(token: string, projectId: string) {
  return apiRequest<BfmOperationsData>(`/api/bfm/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export interface BfmProjectFolder { id: string; name: string; createdAt: string }
export interface BfmProjectResource { id: string; folderId?: string; type: 'file' | 'link'; name: string; relativePath: string; url: string; mimeType: string; size?: number; createdAt: string }

export async function fetchBfmProjectResources(token: string, projectId: string) {
  return apiRequest<{ folders: BfmProjectFolder[]; resources: BfmProjectResource[] }>(`/api/bfm/projects/${encodeURIComponent(projectId)}/resources`, { headers: { authorization: `Bearer ${token}` } });
}
export async function createBfmProjectFolder(token: string, projectId: string, name: string) {
  return apiRequest<{ id: string; name: string }>(`/api/bfm/projects/${encodeURIComponent(projectId)}/folders`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) });
}
export async function createBfmProjectLink(token: string, projectId: string, input: { name: string; url: string; folderId?: string }) {
  return apiRequest<{ id: string }>(`/api/bfm/projects/${encodeURIComponent(projectId)}/links`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
}
export async function uploadBfmProjectFile(token: string, projectId: string, file: File, options: { folderName?: string; relativePath?: string } = {}) {
  const response = await fetch(`/api/bfm/projects/${encodeURIComponent(projectId)}/files`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name), 'x-folder-name': encodeURIComponent(options.folderName || ''), 'x-relative-path': encodeURIComponent(options.relativePath || '') }, body: file });
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Unable to upload project file.'); return body as { id: string };
}
export async function downloadBfmProjectFile(token: string, resource: BfmProjectResource) {
  const response = await fetch(`/api/bfm/project-resources/${encodeURIComponent(resource.id)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Unable to download project file.'); }
  const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = resource.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type PolicyTaskStatus = 'Received' | 'Under Review' | 'For Approval' | 'Approved' | 'Issued' | 'Completed' | 'Returned';

export interface PolicyTaskProcessing {
  taskId: string;
  status: PolicyTaskStatus;
  actionTaken: string;
  updatedAt: string;
}

export async function fetchPolicyTaskProcessing(token: string) {
  const result = await apiRequest<{ records: PolicyTaskProcessing[] }>('/api/policy-task-processing', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.records;
}

export async function updatePolicyTaskProcessing(token: string, taskId: string, update: { status: PolicyTaskStatus; actionTaken: string }) {
  return apiRequest<{ record: PolicyTaskProcessing }>(`/api/policy-task-processing/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(update),
  });
}

export async function fetchHroToolTaskProcessing(token: string, moduleId: string) {
  const result = await apiRequest<{ records: PolicyTaskProcessing[] }>(`/api/hro/tool-task-processing/${encodeURIComponent(moduleId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.records;
}

export async function updateHroToolTaskProcessing(token: string, moduleId: string, taskId: string, update: { status: PolicyTaskStatus; actionTaken: string }) {
  return apiRequest<{ record: PolicyTaskProcessing }>(`/api/hro/tool-task-processing/${encodeURIComponent(moduleId)}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(update),
  });
}

export async function fetchDatabaseSyncLocalTables(token: string) {
  const result = await apiRequest<{ tables: DatabaseSyncTable[]; excludedTables: { tableName: string; reason: string }[] }>('/api/admin/database-sync/local-tables', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result;
}

export async function fetchDatabaseRuntime(token: string) {
  return apiRequest<DatabaseRuntimeStatus>('/api/admin/database-runtime', {
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function switchDatabaseRuntime(token: string, target: 'local' | 'server', connection?: OracleConnectionInput) {
  return apiRequest<DatabaseRuntimeStatus>('/api/admin/database-runtime', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ target, connection }),
  });
}

export async function testDatabaseSyncConnection(token: string, connection: OracleConnectionInput) {
  return apiRequest<{ ok: true; database?: string; container?: string; schema?: string }>('/api/admin/database-sync/test', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ connection }),
  });
}

export async function runDatabaseSync(token: string, connection: OracleConnectionInput, tables: string[], direction: 'push' | 'pull' | 'both') {
  return apiRequest<DatabaseSyncResult>('/api/admin/database-sync/run', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ connection, tables, direction }),
  });
}

export async function pushDatabaseSchema(token: string, connection: OracleConnectionInput, tables: string[]) {
  return apiRequest<DatabaseSchemaSyncResult>('/api/admin/database-sync/push-schema', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ connection, tables }),
  });
}

export async function updateProfilePhoto(token: string, profilePhoto: string) {
  return apiRequest<{ user: ApiUser }>('/api/profile/photo', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ profilePhoto }),
  });
}

export type ProfileDetailsInput = Pick<ApiUser,
  'username' | 'email' | 'firstName' | 'middleName' | 'lastName' | 'suffix' |
  'position' | 'designation' | 'departmentCode' | 'unitName' | 'mobileNo' | 'dateHired' | 'workLocation'
>;

export async function updateProfileDetails(token: string, profile: ProfileDetailsInput) {
  return apiRequest<{ user: ApiUser }>('/api/profile', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
}

export async function fetchCalendarEvents(token?: string) {
  const result = await apiRequest<{ events: CalendarEvent[] }>('/api/calendar/events', token ? {
    headers: { authorization: `Bearer ${token}` },
  } : undefined);
  return result.events;
}

export async function fetchPolicyRecords(token: string) {
  const result = await apiRequest<{ records: PolicyRecord[] }>('/api/policy-records', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.records;
}

export async function fetchRecruitmentRecords(token: string) {
  const result = await apiRequest<{ records: RecruitmentRecord[] }>('/api/hro/recruitment', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.records;
}

export async function fetchHrEmployees(token: string) {
  const result = await apiRequest<{ employees: HrEmployee[] }>('/api/hro/employees', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.employees;
}

export async function fetchOrganization(token: string) {
  const result = await apiRequest<{ organization: OrganizationNode[] }>('/api/hro/organization', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.organization;
}

export async function saveOrganizationNode(token: string, input: Record<string, unknown>) {
  return apiRequest<{ ok: true }>('/api/hro/organization', {
    method: input.id ? 'PUT' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(input),
  });
}

export async function deleteOrganizationNode(token: string, id: string) {
  return apiRequest<{ ok: true }>(`/api/hro/organization/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${token}` },
  });
}

export async function updateHrEmployee(token: string, employeeNo: string, update: Pick<HrEmployee, 'lastName' | 'firstName' | 'middleName' | 'currentPositionType' | 'officialPositionType' | 'positionLevel' | 'dateHired'>) {
  return apiRequest<{ employee: HrEmployee }>(`/api/hro/employees/${encodeURIComponent(employeeNo)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(update),
  });
}

export async function fetchHrServiceRecords(token: string, employeeNo: string) {
  const result = await apiRequest<{ records: HrServiceRecord[] }>(`/api/hro/employees/${encodeURIComponent(employeeNo)}/service-records`, { headers: { authorization: `Bearer ${token}` } });
  return result.records;
}

export async function saveHrServiceRecord(token: string, employeeNo: string, record: Omit<HrServiceRecord, 'id' | 'employeeNo' | 'evidence'>, recordId?: string) {
  const path = recordId ? `/api/hro/service-records/${encodeURIComponent(recordId)}` : `/api/hro/employees/${encodeURIComponent(employeeNo)}/service-records`;
  return apiRequest<{ record: HrServiceRecord }>(path, { method: recordId ? 'PATCH' : 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(record) });
}

export async function deleteHrServiceRecord(token: string, recordId: string) {
  return apiRequest<{ ok: true }>(`/api/hro/service-records/${encodeURIComponent(recordId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function uploadHrServiceEvidence(token: string, recordId: string, file: File) {
  const response = await fetch(`/api/hro/service-records/${encodeURIComponent(recordId)}/evidence`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) }, body: file });
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Unable to upload service-record evidence.');
  return body as { evidence: HrServiceEvidence };
}

export async function downloadHrServiceEvidence(token: string, evidence: HrServiceEvidence) {
  const response = await fetch(`/api/hro/service-evidence/${encodeURIComponent(evidence.id)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Unable to download evidence.'); }
  const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = evidence.fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deleteHrServiceEvidence(token: string, evidenceId: string) {
  return apiRequest<{ ok: true }>(`/api/hro/service-evidence/${encodeURIComponent(evidenceId)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
}

export async function fetchRecruitmentPositions(token: string) {
  const result = await apiRequest<{ positions: string[] }>('/api/hro/recruitment-positions', {
    headers: { authorization: `Bearer ${token}` },
  });
  return result.positions;
}

export async function createRecruitmentPosition(token: string, positionName: string) {
  return apiRequest<{ positionName: string }>('/api/hro/recruitment-positions', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ positionName }),
  });
}

export async function updateRecruitmentRecord(token: string, recordId: string, update: {
  status: RecruitmentStatus;
  actionTaken?: string;
  positionApplying?: string;
  remarks: string;
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  birthDate: string;
  sex: string;
  civilStatus: string;
  email: string;
  mobileNo: string;
  municipality: string;
  barangay: string;
  address: string;
  highestEducation: string;
  schoolName: string;
  yearGraduated: string;
  applicationSource: string;
}) {
  return apiRequest<{ record: RecruitmentRecord }>(`/api/hro/recruitment/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(update),
  });
}

export async function deleteRecruitmentRecord(token: string, recordId: string) {
  return apiRequest<{ ok: true }>(`/api/hro/recruitment/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function archiveRecruitmentTask(token: string, sourceTaskId: string, input: {
  status: RecruitmentStatus;
  positionApplying?: string;
  remarks: string;
  lastName: string;
  firstName: string;
  middleName: string;
  suffix: string;
  birthDate: string;
  sex: string;
  civilStatus: string;
  email: string;
  mobileNo: string;
  municipality: string;
  barangay: string;
  address: string;
  highestEducation: string;
  schoolName: string;
  yearGraduated: string;
  applicationSource: string;
}) {
  return apiRequest<{ record: RecruitmentRecord }>('/api/hro/recruitment/archive', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ sourceTaskId, ...input }),
  });
}

export async function addRecruitmentComment(token: string, recordId: string, message: string) {
  return apiRequest<{ comment: RecruitmentComment }>(`/api/hro/recruitment/${encodeURIComponent(recordId)}/comments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}

export async function createPolicyRecord(token: string, record: PolicyRecordInput) {
  return apiRequest<{ record: PolicyRecord }>('/api/policy-records', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
  });
}

export async function updatePolicyRecord(token: string, recordId: string, record: PolicyRecordInput) {
  return apiRequest<{ record: PolicyRecord }>(`/api/policy-records/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(record),
  });
}

export async function deletePolicyRecord(token: string, recordId: string) {
  return apiRequest<{ ok: true }>(`/api/policy-records/${encodeURIComponent(recordId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function uploadPolicyRecordAttachment(token: string, recordId: string, file: File) {
  const response = await fetch(`/api/policy-records/${encodeURIComponent(recordId)}/attachment`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'x-file-name': encodeURIComponent(file.name),
    },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Unable to upload the DOCX attachment.');
  return body as { ok: true; attachmentName: string; attachmentMimeType: string; attachmentSize: number };
}

export async function deletePolicyRecordAttachment(token: string, recordId: string) {
  return apiRequest<{ ok: true }>(`/api/policy-records/${encodeURIComponent(recordId)}/attachment`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function downloadPolicyRecordAttachment(token: string, recordId: string, fallbackName: string) {
  const response = await fetch(`/api/policy-records/${encodeURIComponent(recordId)}/attachment`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to download the attachment.');
  }
  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fileName = encodedName ? decodeURIComponent(encodedName) : fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function previewPolicyRecordAttachment(token: string, recordId: string) {
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    // Popup blocked — fall back to downloading the file instead of a dead-end error.
    await downloadPolicyRecordAttachment(token, recordId, 'Policy document.docx');
    return;
  }
  previewWindow.opener = null;
  previewWindow.document.title = 'Loading policy attachment…';
  previewWindow.document.body.textContent = 'Loading policy attachment…';

  try {
    const response = await fetch(`/api/policy-records/${encodeURIComponent(recordId)}/attachment`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to preview the attachment.');
    }
    const blob = await response.blob();
    const contentDisposition = response.headers.get('content-disposition') ?? '';
    const encodedName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const fileName = encodedName ? decodeURIComponent(encodedName) : 'Policy document.docx';
    const { renderAsync } = await import('docx-preview');
    const document = previewWindow.document;
    document.open();
    document.write(`<!doctype html><html><head><meta charset="utf-8"><title></title><style>
      *{box-sizing:border-box} body{margin:0;background:#e5e7eb;color:#111827;font-family:Arial,sans-serif}
      .preview-toolbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;background:#052e25;color:white;box-shadow:0 2px 8px #0003}
      .preview-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700}
      .preview-note{flex:none;font-size:12px;color:#bbf7d0}
      #docx-preview{min-height:calc(100vh - 48px);padding:40px 56px 64px;overflow:auto}
      #docx-preview .docx-wrapper{display:flex;flex-direction:column;align-items:center;min-width:max-content;background:transparent;padding:0}
      #docx-preview .docx-wrapper>section.docx{flex:none;margin:0 0 32px!important;box-shadow:0 8px 24px #0004}
      #docx-preview section.docx table{width:100%!important;max-width:100%!important;table-layout:fixed}
      #docx-preview section.docx td,#docx-preview section.docx th{min-width:0!important;max-width:100%;overflow-wrap:anywhere}
      #docx-preview section.docx img{max-width:100%;height:auto}
      #docx-preview .docx-wrapper>section.docx:last-child{margin-bottom:0!important}
      @media(max-width:900px){#docx-preview{padding:24px 16px 40px}}
    </style></head><body><header class="preview-toolbar"><div class="preview-title"></div><div class="preview-note">DOCX preview</div></header><main id="docx-preview"></main></body></html>`);
    document.close();
    document.title = `${fileName} — Preview`;
    const title = document.querySelector<HTMLElement>('.preview-title');
    const container = document.querySelector<HTMLElement>('#docx-preview');
    if (!container) throw new Error('Unable to prepare the document preview.');
    if (title) title.textContent = fileName;
    await renderAsync(await blob.arrayBuffer(), container, document.head, {
      className: 'docx',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
    });
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}

export async function createCalendarEvent(token: string, event: Omit<CalendarEvent, 'id' | 'editable' | 'ownerId'>) {
  return apiRequest<{ event: CalendarEvent }>('/api/calendar/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(event),
  });
}

export async function updateCalendarEvent(token: string, id: string, event: Partial<CalendarEvent>) {
  return apiRequest<{ ok: true }>(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(event),
  });
}

export async function deleteCalendarEvent(token: string, id: string) {
  return apiRequest<{ ok: true }>(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function setCalendarEventDone(token: string, id: string, done: boolean) {
  return apiRequest<{ ok: true }>(`/api/calendar/events/${encodeURIComponent(id)}/done`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ done }),
  });
}

export async function fetchWorkTasks(token?: string) {
  const result = await apiRequest<{ tasks: WorkItem[] }>('/api/work/tasks', token ? {
    headers: { authorization: `Bearer ${token}` },
  } : undefined);
  return result.tasks;
}

export async function createCalendarTask(token: string, task: CalendarTaskInput) {
  return apiRequest<{ task: WorkItem }>('/api/work/tasks', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(task),
  });
}

export async function updateWorkTask(token: string, taskId: string, patch: Partial<CalendarTaskInput> & { status?: string }) {
  return apiRequest<{ task: WorkItem }>(`/api/work/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
}

export async function downloadWorkTaskAttachment(token: string, taskId: string, attachmentIndex: number, fileName: string) {
  const response = await fetch(`/api/work/tasks/${encodeURIComponent(taskId)}/attachments/${attachmentIndex}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to download the attachment.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.split('/').pop() || 'attachment';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createWorkComment(token: string, taskId: string, message: string, parentCommentId?: string) {
  return apiRequest<{ comment: Comment }>(`/api/work/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, parentCommentId }),
  });
}

export async function deleteWorkComment(token: string, taskId: string, commentId: string) {
  return apiRequest<{ ok: true }>(`/api/work/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

export async function updateWorkComment(token: string, taskId: string, commentId: string, message: string) {
  return apiRequest<{ comment: Comment }>(`/api/work/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}
