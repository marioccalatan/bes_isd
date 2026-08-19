import type { CalendarEvent, Comment, Priority, WorkItem } from '@/lib/types';

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

export interface CalendarTaskInput {
  calendarEventId: string;
  controlNumber?: string;
  title: string;
  description?: string;
  assigneeUsername: string;
  departmentId?: string;
  officeAssignment?: string;
  taskSubject?: string;
  attachments?: string[];
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

export async function updateAdminUser(userId: string, user: Partial<AdminUser>) {
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

export async function createCalendarEvent(token: string, event: Omit<CalendarEvent, 'id' | 'editable' | 'color' | 'ownerId'>) {
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
