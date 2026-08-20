import type { AppTool, CalendarEvent, Comment, PolicyDocumentType, PolicyRecord, PolicyRecordNature, Priority, RecruitmentComment, RecruitmentRecord, RecruitmentStatus, WorkItem } from '@/lib/types';

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
  lastName: string;
  email: string;
  position?: string | null;
  departmentCode?: string | null;
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
export interface OrgPosition { id: string; title: string; employeeClass: OrgPositionClass }
export interface OrgOffice { id: string; name: string; parentOfficeId?: string | null; positions: OrgPosition[] }
export interface OrgDepartment { id: string; code: string; name: string; positions: OrgPosition[]; offices: OrgOffice[] }

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
