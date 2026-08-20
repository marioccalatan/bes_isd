import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, X, Plus, Pencil, Trash2, RotateCcw, ShieldCheck, ArrowRight, LayoutGrid, HardDrive,
  Database, PlugZap, RefreshCw, Server, ChevronDown, ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select, Textarea, Checkbox } from '@/components/ui/input';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Toolbar } from '@/components/shared/Toolbar';
import { useData } from '@/context/DataContext';
import { useToast } from '@/context/ToastContext';
import { useTableControls, exportToCsv } from '@/hooks/useTableControls';
import { initials, formatDateTime, formatDate, formatBytes } from '@/lib/utils';
import { NOTIFICATION_TEMPLATES, REFERENCE_PREFIXES } from '@/lib/adminData';
import { CLASS_STYLES_LIST } from '@/lib/docClassifications';
import { WORKFLOWS } from '@/lib/workflows';
import { PROCESS_DEFS } from '@/lib/processDefs';
import { getToolIcon } from '@/lib/toolIcons';
import { NAV_ITEMS, defaultSidebarModuleAccess, type SidebarModuleAccess } from '@/lib/nav';
import {
  deleteAdminUser,
  fetchAdminUsers,
  fetchDatabaseSyncLocalTables,
  fetchOrgStructure,
  fetchModuleRegistry,
  fetchRolePermissionConfig,
  runDatabaseSync,
  pushDatabaseSchema,
  testDatabaseSyncConnection,
  updateAdminUser,
  saveOrgEntity,
  saveToolRegistryEntry,
  saveModuleRegistryAccess,
  type AdminUser,
  type DatabaseSyncResult,
  type DatabaseSchemaSyncResult,
  type DatabaseSyncTable,
  type OracleConnectionInput,
  type OrgDepartment,
  type RolePermissionConfig,
  type UserRoleAssignmentInput,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { DB_SYNC_SESSION_KEY, loadSyncConnection } from '@/lib/databaseRuntime';
import type { AppTool, AuditLogEntry, DepartmentId, Employee, ToolAccessLevel } from '@/lib/types';

const TABS = [
  { value: 'users', label: 'User Management' },
  { value: 'roles', label: 'Roles & Permissions' },
  { value: 'depts', label: 'Departments & Positions' },
  { value: 'modules', label: 'Module Registry' },
  { value: 'tools', label: 'Tool Access' },
  { value: 'storage', label: 'Storage Quotas' },
  { value: 'workflows', label: 'Workflow Configuration' },
  { value: 'news', label: 'News & Memo Publishing' },
  { value: 'calendar', label: 'Calendar Administration' },
  { value: 'docs', label: 'Document Classifications' },
  { value: 'refnum', label: 'Reference Numbers' },
  { value: 'notif', label: 'Notification Templates' },
  { value: 'audit', label: 'Audit Logs' },
  { value: 'dbsync', label: 'Database Sync' },
  { value: 'demo', label: 'Demo Data' },
];

const TOOL_DEPT_TABS: { value: DepartmentId | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ISD', label: 'ISD' },
  { value: 'NSD', label: 'NSD' },
  { value: 'NNSD', label: 'NNSD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'CPD', label: 'CPD' },
  { value: 'PGD', label: 'PGD' },
];

const ACCESS_LEVELS: ToolAccessLevel[] = ['ADMIN', 'EDIT', 'VIEW', 'OPEN', 'NEW', 'SOON', 'EXISTING'];
const ORG_CLASS_LABELS: Record<string, string> = {
  DEPARTMENT_MANAGER: 'Department Manager', DEPARTMENT_SECRETARY: 'Department Secretary',
  OFFICE_SECRETARY: 'Office Secretary', SUPERVISOR: 'Supervisor', RAF: 'Rank-and-File (RAF)',
};
const OFFICE_CLASS_ORDER = ['OFFICE_SECRETARY', 'SUPERVISOR', 'RAF'];

const LEVEL_BADGE_STYLES: Record<ToolAccessLevel, string> = {
  ADMIN: 'border-brand-200 bg-brand-50 text-brand-700',
  EDIT: 'border-gold-200 bg-gold-50 text-gold-800',
  VIEW: 'border-slate-200 bg-slate-100 text-slate-600',
  OPEN: 'border-green-200 bg-green-50 text-green-700',
  NEW: 'border-gold-200 bg-gold-50 text-gold-800',
  SOON: 'border-slate-200 bg-slate-100 text-slate-400',
  EXISTING: 'border-slate-200 bg-slate-100 text-slate-400',
};

type UserEditForm = {
  employeeNo: string;
  username: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  position: string;
  departmentCode: string;
  unitName: string;
  mobileNo: string;
  employmentStatus: string;
  accountStatus: string;
  role: string;
  roleAssignments: UserRoleAssignmentInput[];
};

const emptyUserEditForm: UserEditForm = {
  employeeNo: '',
  username: '',
  email: '',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  position: '',
  departmentCode: '',
  unitName: '',
  mobileNo: '',
  employmentStatus: 'Active',
  accountStatus: 'ACTIVE',
  role: 'Employee',
  roleAssignments: [],
};

function toUserEditForm(user: AdminUser, roleConfig: RolePermissionConfig | null): UserEditForm {
  const assignments = (roleConfig?.assignments ?? [])
    .filter((assignment) => assignment.username === user.username)
    .map((assignment) => ({
      roleCode: assignment.roleCode,
      departmentCode: assignment.departmentCode ?? '',
      unitName: assignment.unitName ?? '',
      note: assignment.note ?? '',
    }));
  return {
    employeeNo: user.employeeNo,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    middleName: user.middleName ?? '',
    lastName: user.lastName,
    suffix: user.suffix ?? '',
    position: user.position ?? '',
    departmentCode: user.departmentCode ?? '',
    unitName: user.unitName ?? '',
    mobileNo: user.mobileNo ?? '',
    employmentStatus: user.employmentStatus,
    accountStatus: user.accountStatus,
    role: user.role,
    roleAssignments: assignments.length > 0 ? assignments : [{ roleCode: user.role, departmentCode: '', unitName: '', note: '' }],
  };
}

function ToolAccessEditor({
  tool,
  departments,
  scopedDepartmentId,
  onClose,
}: {
  tool: AppTool;
  departments: { id: DepartmentId; shortName: string; name: string; positions: { title: string; employeeClass: string }[]; units: { name: string; positions: { title: string; employeeClass: string }[] }[] }[];
  scopedDepartmentId?: DepartmentId | null;
  onClose: () => void;
}) {
  const { setToolAccess, updateTool } = useData();
  const { token } = useAuth();
  const { toast } = useToast();
  const scopedDept = scopedDepartmentId ? departments.find((d) => d.id === scopedDepartmentId) ?? null : null;
  const [editorTab, setEditorTab] = useState<'office' | 'subjects'>('office');
  const [subjects, setSubjects] = useState<string[]>(tool.taskSubjects ?? []);
  const [subjectDraft, setSubjectDraft] = useState('');
  const [toolStatus, setToolStatus] = useState<'SOON' | 'ENABLED' | 'DISABLED'>(tool.status ?? 'ENABLED');

  // Departments whose access is already broken down per-office can't be safely
  // collapsed back into a single department-wide row from the coarse editor —
  // they must be edited from that department's own tab.
  const officeManagedDeptIds = new Set(
    departments.filter((d) => tool.access.some((a) => a.departmentId === d.id && (a.unit || a.position))).map((d) => d.id)
  );

  const [grants, setGrants] = useState<Record<DepartmentId, ToolAccessLevel | null>>(() => {
    const map = {} as Record<DepartmentId, ToolAccessLevel | null>;
    departments.forEach((d) => {
      const existing = tool.access.find((a) => a.departmentId === d.id && !a.unit && !a.position);
      map[d.id] = existing ? existing.level : null;
    });
    return map;
  });

  const scopeOptions = scopedDept ? [
    ...(scopedDept.positions.some((position) => position.employeeClass === 'DEPARTMENT_SECRETARY')
      ? scopedDept.positions.filter((position) => position.employeeClass === 'DEPARTMENT_SECRETARY').map((position) => ({ key: `department-position:${position.title}`, label: `Department Secretary — ${position.title}`, unit: undefined, position: position.title, depth: 0 }))
      : [{ key: 'department-position:Department Secretary', label: 'Department Secretary', unit: undefined, position: 'Department Secretary', depth: 0 }]),
    ...scopedDept.units.flatMap((unit) => [
      { key: `office:${unit.name}`, label: unit.name, unit: unit.name, position: undefined, depth: 0 },
      ...unit.positions.filter((position) => position.employeeClass === 'SUPERVISOR').map((position) => ({
        key: `office-position:${unit.name}:${position.title}`,
        label: `Supervisor — ${position.title}`,
        unit: unit.name,
        position: position.title,
        depth: 1,
      })),
      ...(unit.positions.some((position) => position.employeeClass === 'OFFICE_SECRETARY')
        ? unit.positions.filter((position) => position.employeeClass === 'OFFICE_SECRETARY').map((position) => ({ key: `office-position:${unit.name}:${position.title}`, label: `Office Secretary — ${position.title}`, unit: unit.name, position: position.title, depth: 1 }))
        : [{ key: `office-position:${unit.name}:Office Secretary`, label: 'Office Secretary', unit: unit.name, position: 'Office Secretary', depth: 1 }]),
      ...unit.positions.filter((position) => !['SUPERVISOR', 'OFFICE_SECRETARY'].includes(position.employeeClass)).map((position) => ({
        key: `office-position:${unit.name}:${position.title}`,
        label: position.employeeClass === 'RAF' ? position.title : `${ORG_CLASS_LABELS[position.employeeClass] ?? position.employeeClass} — ${position.title}`,
        unit: unit.name,
        position: position.title,
        depth: 1,
      })),
    ]),
  ] : [];

  const [officeGrants, setOfficeGrants] = useState<Record<string, ToolAccessLevel | null>>(() => {
    if (!scopedDept) return {};
    const rows = tool.access.filter((a) => a.departmentId === scopedDept.id);
    const scopedRows = rows.filter((a) => a.unit || a.position);
    const deptWide = rows.find((a) => !a.unit && !a.position);
    const map: Record<string, ToolAccessLevel | null> = {};
    scopeOptions.forEach((option) => {
      const existing = scopedRows.find((grant) => grant.unit === option.unit && grant.position === option.position);
      map[option.key] = existing ? existing.level : deptWide ? deptWide.level : null;
    });
    return map;
  });

  function toggle(deptId: DepartmentId, checked: boolean) {
    setGrants((prev) => ({ ...prev, [deptId]: checked ? (prev[deptId] ?? 'VIEW') : null }));
  }
  function setLevel(deptId: DepartmentId, level: ToolAccessLevel) {
    setGrants((prev) => ({ ...prev, [deptId]: level }));
  }
  function toggleOffice(key: string, checked: boolean) {
    setOfficeGrants((prev) => {
      const option = scopeOptions.find((item) => item.key === key);
      const positionClass = option?.position && option.unit
        ? scopedDept?.units.find((unit) => unit.name === option.unit)?.positions.find((position) => position.title === option.position)?.employeeClass
        : undefined;
      const defaultLevel: ToolAccessLevel = option?.unit && !option.position
        ? 'ADMIN'
        : positionClass === 'SUPERVISOR' ? 'ADMIN' : 'EDIT';
      const next = { ...prev, [key]: checked ? (prev[key] ?? defaultLevel) : null };
      if (checked && option?.unit && !option.position) {
        scopeOptions
          .filter((item) => item.unit === option.unit)
          .forEach((item) => {
            const itemClass = item.position
              ? scopedDept?.units.find((unit) => unit.name === item.unit)?.positions.find((position) => position.title === item.position)?.employeeClass
              : undefined;
            const itemDefault: ToolAccessLevel = !item.position || itemClass === 'SUPERVISOR' ? 'ADMIN' : 'EDIT';
            next[item.key] = prev[item.key] ?? itemDefault;
          });
      }
      if (checked && option?.unit && option.position) {
        const parentOffice = scopeOptions.find((item) => item.unit === option.unit && !item.position);
        if (parentOffice) next[parentOffice.key] = prev[parentOffice.key] ?? 'ADMIN';
      }
      if (!checked && option?.unit && !option.position) {
        scopeOptions
          .filter((item) => item.unit === option.unit)
          .forEach((item) => { next[item.key] = null; });
      }
      return next;
    });
  }
  function setOfficeLevel(unit: string, level: ToolAccessLevel) {
    setOfficeGrants((prev) => ({ ...prev, [unit]: level }));
  }

  function addSubject() {
    const next = subjectDraft.trim();
    if (!next) return;
    if (subjects.some((s) => s.toLowerCase() === next.toLowerCase())) {
      setSubjectDraft('');
      return;
    }
    setSubjects((prev) => [...prev, next]);
    setSubjectDraft('');
  }
  function removeSubject(subject: string) {
    setSubjects((prev) => prev.filter((s) => s !== subject));
  }
  async function saveSubjects() {
    const updatedTool = { ...tool, taskSubjects: subjects, status: toolStatus };
    try {
      if (!token) throw new Error('Administrator session required.');
      await saveToolRegistryEntry(token, updatedTool);
      updateTool(tool.code, { taskSubjects: subjects, status: toolStatus });
      toast({ kind: 'success', title: 'Task Subjects updated', description: `${tool.code} now matches ${subjects.length} subject${subjects.length === 1 ? '' : 's'} in Oracle.` });
      onClose();
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save Task Subjects', description: error instanceof Error ? error.message : 'Oracle update failed.' });
    }
  }

  async function save() {
    let access: typeof tool.access;
    if (scopedDept) {
      const officeRows: typeof tool.access = Object.entries(officeGrants)
        .filter(([, level]) => level != null)
        .map(([key, level]) => {
          const option = scopeOptions.find((item) => item.key === key)!;
          return { departmentId: scopedDept.id, unit: option.unit, position: option.position, level: level! };
        });
      const otherRows = tool.access.filter((a) => a.departmentId !== scopedDept.id);
      access = [...otherRows, ...officeRows];
    } else {
      const editableRows = departments
        .filter((d) => !officeManagedDeptIds.has(d.id) && grants[d.id] != null)
        .map((d) => ({ departmentId: d.id, level: grants[d.id]! }));
      const preservedRows = tool.access.filter((a) => officeManagedDeptIds.has(a.departmentId));
      access = [...preservedRows, ...editableRows];
    }
    try {
      if (!token) throw new Error('Administrator session required.');
      await saveToolRegistryEntry(token, { ...tool, access, status: toolStatus });
      updateTool(tool.code, { status: toolStatus });
      setToolAccess(tool.code, access);
      toast({ kind: 'success', title: 'Tool access updated', description: `${tool.code} access and status are now shared through Oracle.` });
      onClose();
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save tool access', description: error instanceof Error ? error.message : 'Oracle update failed.' });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{tool.description}</p>
      <div><Label htmlFor="tool-status">Tool Status</Label><Select id="tool-status" value={toolStatus} onChange={(event) => setToolStatus(event.target.value as 'SOON' | 'ENABLED' | 'DISABLED')}><option value="ENABLED">ENABLED</option><option value="SOON">SOON</option><option value="DISABLED">DISABLED</option></Select></div>
      <Tabs
        tabs={[{ value: 'office', label: 'Sub-Office' }, { value: 'subjects', label: 'Task Subject' }]}
        value={editorTab}
        onChange={(v) => setEditorTab(v as 'office' | 'subjects')}
      />

      {editorTab === 'office' && scopedDept && (
        <>
          <p className="text-xs text-slate-500">
            Setting access per office within <span className="font-medium text-slate-700">{scopedDept.name}</span>.
            {scopedDept.id === tool.ownerDepartmentId && <Badge className="ml-1.5 border-gold-200 bg-gold-50 text-gold-800">Owner dept.</Badge>}
          </p>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {scopeOptions.map((option) => {
              const level = officeGrants[option.key];
              return (
                <div key={option.key} className={`flex flex-wrap items-center justify-between gap-2 p-2.5 ${option.depth ? 'pl-7' : ''}`}>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox checked={level != null} onChange={(e) => toggleOffice(option.key, e.target.checked)} />
                    {option.label}
                  </label>
                  <Select
                    value={level ?? ''}
                    disabled={level == null}
                    onChange={(e) => setOfficeLevel(option.key, e.target.value as ToolAccessLevel)}
                    className="w-auto"
                    aria-label={`Access level for ${option.label}`}
                  >
                    {level == null && <option value="">No access</option>}
                    {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editorTab === 'office' && !scopedDept && (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {departments.map((d) => {
            const officeManaged = officeManagedDeptIds.has(d.id);
            const level = grants[d.id];
            return (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  {!officeManaged && <Checkbox checked={level != null} onChange={(e) => toggle(d.id, e.target.checked)} />}
                  {d.name}
                  {d.id === tool.ownerDepartmentId && <Badge className="border-gold-200 bg-gold-50 text-gold-800">Owner</Badge>}
                </label>
                {officeManaged ? (
                  <span className="text-xs text-slate-400">Configured per office — edit from the {d.shortName} tab</span>
                ) : (
                  <Select
                    value={level ?? ''}
                    disabled={level == null}
                    onChange={(e) => setLevel(d.id, e.target.value as ToolAccessLevel)}
                    className="w-auto"
                    aria-label={`Access level for ${d.name}`}
                  >
                    {level == null && <option value="">No access</option>}
                    {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editorTab === 'subjects' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Tasks created under My Work with a matching Subject will appear under this tool's Task tab.
          </p>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-2.5 empty:hidden">
            {subjects.map((subject) => (
              <Badge key={subject} className="flex items-center gap-1 border-brand-200 bg-brand-50 text-brand-700">
                {subject}
                <button type="button" onClick={() => removeSubject(subject)} aria-label={`Remove ${subject}`} className="hover:text-brand-900">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {subjects.length === 0 && <span className="text-xs text-slate-400">No subjects set yet.</span>}
          </div>
          <div className="flex gap-2">
            <Input
              value={subjectDraft}
              onChange={(e) => setSubjectDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubject(); } }}
              placeholder="e.g. Application Letter"
              aria-label="New task subject"
            />
            <Button type="button" variant="outline" onClick={addSubject}>Add</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={editorTab === 'office' ? save : saveSubjects}>
          {editorTab === 'office' ? 'Save Access' : 'Save Subjects'}
        </Button>
      </div>
    </div>
  );
}

function QuotaEditor({ employee, quotaBytes, onClose }: { employee: Employee; quotaBytes: number; onClose: () => void }) {
  const { setUserStorageQuota, storageUsedBytes } = useData();
  const { toast } = useToast();
  const [mb, setMb] = useState(Math.round(quotaBytes / (1024 * 1024)));

  function save() {
    setUserStorageQuota(employee.id, Math.max(0, mb) * 1024 * 1024);
    toast({ kind: 'success', title: 'Storage quota updated', description: `${employee.name} — ${mb.toLocaleString()} MB` });
    onClose();
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="quota-mb">Quota (MB)</Label>
        <Input id="quota-mb" type="number" min={0} value={mb} onChange={(e) => setMb(Number(e.target.value))} />
        <p className="mt-1 text-xs text-slate-500">Current usage: {formatBytes(storageUsedBytes(employee.id))}</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save}>Save Quota</Button>
      </div>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const { employees, departments, events, news, auditLog, tools, resetDemoData, storageUsedBytes, storageQuotaBytes } = useData();
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('users');
  const [oracleUsers, setOracleUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState('');
  const [userEdit, setUserEdit] = useState<AdminUser | null>(null);
  const [userEditForm, setUserEditForm] = useState<UserEditForm>(emptyUserEditForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userDeleting, setUserDeleting] = useState(false);
  const [userDeleteOpen, setUserDeleteOpen] = useState(false);
  const [userSaveError, setUserSaveError] = useState('');
  const [roleConfig, setRoleConfig] = useState<RolePermissionConfig | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState<typeof NOTIFICATION_TEMPLATES[number] | null>(null);
  const [toolEdit, setToolEdit] = useState<AppTool | null>(null);
  const [toolSearch, setToolSearch] = useState('');
  const [toolDeptTab, setToolDeptTab] = useState<DepartmentId | 'ALL'>('ALL');
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleAccess, setModuleAccess] = useState<SidebarModuleAccess>(() => defaultSidebarModuleAccess());
  const [quotaEdit, setQuotaEdit] = useState<Employee | null>(null);
  const [syncConnection, setSyncConnection] = useState<OracleConnectionInput>(loadSyncConnection);
  const [syncTables, setSyncTables] = useState<DatabaseSyncTable[]>([]);
  const [syncExcludedTables, setSyncExcludedTables] = useState<{ tableName: string; reason: string }[]>([]);
  const [syncSelectedTables, setSyncSelectedTables] = useState<string[]>([]);
  const [syncLoadingTables, setSyncLoadingTables] = useState(false);
  const [syncTesting, setSyncTesting] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncDirection, setSyncDirection] = useState<'push' | 'pull' | 'both'>('push');
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncResult, setSyncResult] = useState<DatabaseSyncResult | null>(null);
  const [schemaSyncResult, setSchemaSyncResult] = useState<DatabaseSchemaSyncResult | null>(null);
  const [schemaSyncConfirmOpen, setSchemaSyncConfirmOpen] = useState(false);
  const [schemaSyncRunning, setSchemaSyncRunning] = useState(false);
  const [orgDepartments, setOrgDepartments] = useState<OrgDepartment[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgEditor, setOrgEditor] = useState<Record<string, string> | null>(null);
  const [orgSaving, setOrgSaving] = useState(false);
  const [collapsedDepartments, setCollapsedDepartments] = useState<Set<string>>(new Set());

  async function loadOracleUsers(cancelled?: () => boolean) {
    setUsersLoading(true);
    setUsersError('');
    try {
      const users = await fetchAdminUsers();
      if (!cancelled?.()) setOracleUsers(users);
    } catch (error) {
      if (!cancelled?.()) setUsersError(error instanceof Error ? error.message : 'Unable to load Oracle users.');
    } finally {
      if (!cancelled?.()) setUsersLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadOracleUsers(() => cancelled);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token) return;
    fetchModuleRegistry(token)
      .then((rows) => setModuleAccess(Object.fromEntries(rows.map((row) => [row.path, row.departmentIds])) as SidebarModuleAccess))
      .catch((error) => toast({ kind: 'error', title: 'Unable to load Module Registry', description: error instanceof Error ? error.message : 'Oracle request failed.' }));
  }, [token]);

  async function loadOrgStructure() {
    if (!token) return;
    setOrgLoading(true);
    try {
      const loadedDepartments = await fetchOrgStructure(token);
      if (orgDepartments.length === 0) setCollapsedDepartments(new Set(loadedDepartments.map((department) => department.id)));
      setOrgDepartments(loadedDepartments);
    }
    catch (error) { toast({ kind: 'error', title: 'Unable to load organizational structure', description: error instanceof Error ? error.message : 'Oracle request failed.' }); }
    finally { setOrgLoading(false); }
  }

  useEffect(() => {
    if ((tab === 'users' || tab === 'depts' || tab === 'tools') && orgDepartments.length === 0 && !orgLoading) void loadOrgStructure();
  }, [tab]);

  async function saveOrganizationEditor() {
    if (!token || !orgEditor) return;
    setOrgSaving(true);
    try {
      await saveOrgEntity(token, orgEditor);
      await loadOrgStructure();
      setOrgEditor(null);
      toast({ kind: 'success', title: 'Organizational structure updated', description: 'The change was saved to Oracle.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save', description: error instanceof Error ? error.message : 'Oracle request failed.' });
    } finally { setOrgSaving(false); }
  }

  function openUserEdit(user: AdminUser) {
    setUserEdit(user);
    setUserEditForm(toUserEditForm(user, roleConfig));
    setUserSaveError('');
  }

  function hasAssignedRole(roleCode: string) {
    return userEditForm.roleAssignments.some((assignment) => assignment.roleCode === roleCode);
  }

  function toggleAssignedRole(roleCode: string, checked: boolean) {
    setUserEditForm((form) => {
      if (!checked) {
        const remaining = form.roleAssignments.filter((assignment) => assignment.roleCode !== roleCode);
        return { ...form, roleAssignments: remaining, role: remaining[0]?.roleCode ?? 'Employee' };
      }
      if (form.roleAssignments.some((assignment) => assignment.roleCode === roleCode)) return form;
      const nextAssignments = [...form.roleAssignments, { roleCode, departmentCode: roleCode === 'Department Manager' ? form.departmentCode : '', unitName: '', note: '' }];
      return { ...form, roleAssignments: nextAssignments, role: form.roleAssignments.length === 0 ? roleCode : form.role };
    });
  }

  function updateAssignedRole(roleCode: string, patch: Partial<UserRoleAssignmentInput>) {
    setUserEditForm((form) => ({
      ...form,
      roleAssignments: form.roleAssignments.map((assignment) => assignment.roleCode === roleCode ? { ...assignment, ...patch } : assignment),
    }));
  }

  async function saveUserEdit() {
    if (!userEdit) return;
    setUserSaving(true);
    setUserSaveError('');
    try {
      const selectedDepartment = orgDepartments.find((department) => department.code === userEditForm.departmentCode);
      const selectedPosition = selectedDepartment?.positions.find((position) => position.title === userEditForm.position)
        ?? selectedDepartment?.offices.find((office) => office.name === userEditForm.unitName)?.positions.find((position) => position.title === userEditForm.position)
        ?? selectedDepartment?.offices.flatMap((office) => office.positions).find((position) => position.title === userEditForm.position);
      const structuralRole = selectedPosition ? ({
        DEPARTMENT_MANAGER: 'Department Manager', DEPARTMENT_SECRETARY: 'Department Secretary',
        OFFICE_SECRETARY: 'Office Secretary', SUPERVISOR: 'Supervisor', RAF: 'Employee',
      } as const)[selectedPosition.employeeClass] : 'Employee';
      const administratorAssignment = userEditForm.roleAssignments.find((assignment) => assignment.roleCode === 'Administrator');
      const roleAssignments: UserRoleAssignmentInput[] = [{
        roleCode: structuralRole,
        departmentCode: userEditForm.departmentCode || null,
        unitName: userEditForm.unitName || null,
        note: `Derived from organizational position: ${userEditForm.position || 'Unspecified'}`,
      }];
      if (administratorAssignment) roleAssignments.push({ ...administratorAssignment, departmentCode: null, unitName: null });
      await updateAdminUser(userEdit.id, { ...userEditForm, role: administratorAssignment ? 'Administrator' : structuralRole, roleAssignments });
      await loadOracleUsers();
      toast({ kind: 'success', title: 'Employee information updated', description: `${userEditForm.firstName} ${userEditForm.lastName} was saved to Oracle BES_USERS.` });
      setUserEdit(null);
    } catch (error) {
      setUserSaveError(error instanceof Error ? error.message : 'Unable to update employee information.');
    } finally {
      setUserSaving(false);
    }
  }

  async function deleteUserEdit() {
    if (!userEdit) return;
    if (!token) {
      setUserSaveError('Your admin session is required before deleting an employee.');
      return;
    }
    if (String(user?.id) === String(userEdit.id) || user?.username === userEdit.username) {
      setUserSaveError('You cannot delete your own administrator account while you are signed in.');
      setUserDeleteOpen(false);
      return;
    }
    setUserDeleting(true);
    setUserSaveError('');
    try {
      await deleteAdminUser(token, userEdit.id);
      await loadOracleUsers();
      toast({ kind: 'success', title: 'Employee deleted', description: `${userEdit.name} was disabled, signed out, and removed from the active user list.` });
      setUserDeleteOpen(false);
      setUserEdit(null);
    } catch (error) {
      setUserSaveError(error instanceof Error ? error.message : 'Unable to delete employee.');
      setUserDeleteOpen(false);
    } finally {
      setUserDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setRolesLoading(true);
    setRolesError('');
    fetchRolePermissionConfig()
      .then((config) => {
        if (!cancelled) setRoleConfig(config);
      })
      .catch((error) => {
        if (!cancelled) setRolesError(error instanceof Error ? error.message : 'Unable to load Oracle roles and permissions.');
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function loadDatabaseSyncTables() {
    if (!token) {
      setSyncMessage('Sign in as an Administrator before loading database sync tables.');
      return;
    }
    setSyncLoadingTables(true);
    setSyncMessage('');
    try {
      const result = await fetchDatabaseSyncLocalTables(token);
      setSyncTables(result.tables);
      setSyncExcludedTables(result.excludedTables);
      setSyncSelectedTables((selected) => selected.length ? selected.filter((table) => result.tables.some((item) => item.tableName === table)) : result.tables.map((table) => table.tableName));
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Unable to load local Oracle tables.');
    } finally {
      setSyncLoadingTables(false);
    }
  }

  useEffect(() => {
    if (tab === 'dbsync' && syncTables.length === 0 && !syncLoadingTables) {
      void loadDatabaseSyncTables();
    }
  }, [tab]);

  useEffect(() => {
    if (syncConnection.savePassword) {
      window.sessionStorage.setItem(DB_SYNC_SESSION_KEY, JSON.stringify(syncConnection));
    } else {
      window.sessionStorage.removeItem(DB_SYNC_SESSION_KEY);
    }
  }, [syncConnection]);

  function updateSyncConnection(patch: Partial<OracleConnectionInput>) {
    setSyncConnection((connection) => ({ ...connection, ...patch }));
  }

  async function testSyncConnection() {
    if (!token) {
      setSyncMessage('Sign in as an Administrator before testing a sync connection.');
      return;
    }
    setSyncTesting(true);
    setSyncMessage('');
    try {
      const result = await testDatabaseSyncConnection(token, syncConnection);
      setSyncMessage(`Connection OK — ${[result.database, result.container, result.schema].filter(Boolean).join(' / ') || 'Oracle target reached'}.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Unable to connect to the target Oracle database.');
    } finally {
      setSyncTesting(false);
    }
  }

  async function runSelectedDatabaseSync() {
    if (!token) {
      setSyncMessage('Sign in as an Administrator before running database sync.');
      return;
    }
    setSyncRunning(true);
    setSyncMessage('');
    try {
      const result = await runDatabaseSync(token, syncConnection, syncSelectedTables, syncDirection);
      setSyncResult(result);
      setSyncMessage(`Sync completed — ${result.tables.reduce((sum, table) => sum + table.rowCount, 0).toLocaleString()} rows copied.`);
      setSyncConfirmOpen(false);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Unable to run database sync.');
    } finally {
      setSyncRunning(false);
    }
  }

  const { search: userSearch, setSearch: setUserSearch, pageRows: userRows } = useTableControls(oracleUsers, (e, q) =>
    e.name.toLowerCase().includes(q) ||
    e.username.toLowerCase().includes(q) ||
    e.email.toLowerCase().includes(q) ||
    e.employeeNo.toLowerCase().includes(q) ||
    (e.position ?? '').toLowerCase().includes(q) ||
    (e.departmentCode ?? '').toLowerCase().includes(q) ||
    e.role.toLowerCase().includes(q) ||
    e.roles.some((role) => role.toLowerCase().includes(q)), 12);
  const { search: auditSearch, setSearch: setAuditSearch, pageRows: auditRows } = useTableControls(auditLog, (a, q) => a.actor.toLowerCase().includes(q) || a.action.toLowerCase().includes(q) || a.target.toLowerCase().includes(q), 15);
  const { search: storageSearch, setSearch: setStorageSearch, pageRows: storageRows } = useTableControls(employees, (e, q) => e.name.toLowerCase().includes(q) || e.position.toLowerCase().includes(q), 12);

  const userColumns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (e) => (
      <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{initials(e.name)}</span><span><span className="block font-medium text-slate-800">{e.name}</span><span className="block text-xs text-slate-400">{e.username}</span></span></span>
    ) },
    { key: 'employeeNo', header: 'Employee ID', render: (e) => <span className="font-mono text-xs">{e.employeeNo}</span>, hideOnCard: true },
    { key: 'email', header: 'Email', render: (e) => <span className="text-xs">{e.email}</span>, hideOnCard: true },
    { key: 'position', header: 'Position', render: (e) => e.position || '—' },
    { key: 'departmentCode', header: 'Dept.', render: (e) => e.departmentCode ? <Badge>{e.departmentCode}</Badge> : '—' },
    { key: 'accountStatus', header: 'Status', render: (e) => <Badge className={e.accountStatus === 'ACTIVE' ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-slate-100 text-slate-600'}>{e.accountStatus}</Badge> },
    { key: 'role', header: 'BES Roles', render: (e) => (
      <span className="flex flex-wrap gap-1">
        {e.roles.map((role) => <Badge key={role} className={role.startsWith('Administrator') ? 'border-gold-200 bg-gold-50 text-gold-800' : 'border-brand-200 bg-brand-50 text-brand-700'}>{role}</Badge>)}
      </span>
    ), hideOnCard: true },
    { key: 'actions', header: '', className: 'text-right', render: (e) => (
      <Button variant="ghost" size="sm" onClick={() => openUserEdit(e)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
    ) },
  ];

  const roleMatrix = useMemo(() => {
    const map = new Map<string, boolean>();
    roleConfig?.matrix.forEach((entry) => map.set(`${entry.roleCode}:${entry.permissionCode}`, entry.granted));
    return map;
  }, [roleConfig]);

  const auditColumns: Column<AuditLogEntry>[] = [
    { key: 'timestamp', header: 'Timestamp', render: (a) => formatDateTime(a.timestamp) },
    { key: 'actor', header: 'Actor', render: (a) => a.actor },
    { key: 'action', header: 'Action', render: (a) => a.action },
    { key: 'target', header: 'Target', render: (a) => <span className="font-mono text-xs">{a.target}</span>, hideOnCard: true },
    { key: 'category', header: 'Category', render: (a) => <Badge>{a.category}</Badge> },
    { key: 'ipAddress', header: 'IP Address', render: (a) => a.ipAddress, hideOnCard: true },
  ];

  const storageColumns: Column<Employee>[] = [
    { key: 'name', header: 'Employee', render: (e) => (
      <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{initials(e.name)}</span><span className="font-medium text-slate-800">{e.name}</span></span>
    ) },
    { key: 'departmentId', header: 'Dept.', render: (e) => <Badge>{e.departmentId}</Badge> },
    { key: 'used', header: 'Used', render: (e) => formatBytes(storageUsedBytes(e.id)) },
    { key: 'quota', header: 'Quota', render: (e) => formatBytes(storageQuotaBytes(e.id)) },
    { key: 'pct', header: 'Usage', hideOnCard: true, render: (e) => {
      const used = storageUsedBytes(e.id);
      const quota = storageQuotaBytes(e.id);
      const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className={`block h-1.5 rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} /></span>
          <span className="text-xs text-slate-500">{pct}%</span>
        </span>
      );
    } },
    { key: 'actions', header: '', className: 'text-right', render: (e) => (
      <Button variant="ghost" size="sm" onClick={() => setQuotaEdit(e)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
    ) },
  ];

  const filteredSidebarModules = useMemo(() => {
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q) || item.to.toLowerCase().includes(q));
  }, [moduleSearch]);

  const currentDepartmentCode = user?.departmentCode as DepartmentId | undefined;
  const employeeFormDepartment = orgDepartments.find((department) => department.code === userEditForm.departmentCode);
  const employeeFormOffice = employeeFormDepartment?.offices.find((office) => office.name === userEditForm.unitName);
  const employeeFormPositions = employeeFormDepartment
    ? (employeeFormOffice?.positions ?? employeeFormDepartment.positions).map((position) => ({ value: position.title, label: `${position.title} — ${ORG_CLASS_LABELS[position.employeeClass]}` }))
    : [];
  const toolDepartmentTabs = orgDepartments.length > 0
    ? [{ value: 'ALL', label: 'All' }, ...orgDepartments.map((department) => ({ value: department.code, label: department.code }))]
    : TOOL_DEPT_TABS;
  const currentDepartmentEnabledCount = currentDepartmentCode
    ? NAV_ITEMS.filter((item) => !item.adminOnly && (moduleAccess[item.to] ?? []).includes(currentDepartmentCode)).length
    : 0;
  const standardSidebarModuleCount = NAV_ITEMS.filter((item) => !item.adminOnly).length;

  async function persistModuleAccess(nextAccess: SidebarModuleAccess, message: string) {
    if (!token) return;
    try {
      await saveModuleRegistryAccess(token, nextAccess);
      setModuleAccess(nextAccess);
      toast({ kind: 'success', title: 'Module Registry updated', description: message });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save Module Registry', description: error instanceof Error ? error.message : 'Oracle update failed.' });
    }
  }

  async function runSelectedSchemaPush() {
    if (!token) return setSyncMessage('Sign in as an Administrator before pushing database schema.');
    setSchemaSyncRunning(true);
    setSyncMessage('');
    try {
      const result = await pushDatabaseSchema(token, syncConnection, syncSelectedTables);
      setSchemaSyncResult(result);
      const created = result.tables.filter((table) => table.created).length;
      const added = result.tables.reduce((sum, table) => sum + table.addedColumns.length, 0);
      setSyncMessage(`Schema push completed — ${created} tables created and ${added} columns added.`);
      setSchemaSyncConfirmOpen(false);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Unable to push database schema.');
    } finally {
      setSchemaSyncRunning(false);
    }
  }

  function updateModuleDepartmentAccess(modulePath: string, departmentId: DepartmentId, checked: boolean) {
    const previous = moduleAccess[modulePath] ?? [];
    const nextDepartments = checked
      ? Array.from(new Set([...previous, departmentId]))
      : previous.filter((id) => id !== departmentId);
    void persistModuleAccess({ ...moduleAccess, [modulePath]: nextDepartments }, 'Department visibility was saved to Oracle.');
  }

  function setModuleForAllDepartments(modulePath: string, enabled: boolean) {
    void persistModuleAccess({ ...moduleAccess, [modulePath]: enabled ? departments.map((d) => d.id) : [] }, 'Module visibility was saved to Oracle.');
  }

  function resetSidebarModuleAccess() {
    void persistModuleAccess(defaultSidebarModuleAccess(), 'All standard sidebar modules are available to all departments again.');
  }

  const orgEvents = events.filter((e) => !e.editable);

  return (
    <div>
      <PageHeader title="Administration" description="Technical administration for BES. Business data access remains governed separately by role and classification." crumbs={[{ label: 'Administration' }]} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-5" />

      {tab === 'users' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>User Management</CardTitle>
            <Button size="sm" onClick={() => toast({ kind: 'info', title: 'Oracle-backed users', description: 'New accounts are created from the login page signup process and stored in BES_USERS.' })}><Plus className="h-4 w-4" /> Add User</Button>
          </CardHeader>
          <CardContent>
            {usersError && <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{usersError}</div>}
            <Toolbar search={userSearch} onSearchChange={setUserSearch} placeholder="Search Oracle users…" onExport={() => exportToCsv('bes-users.csv', ['Name', 'Username', 'Email', 'Employee ID', 'Position', 'Department', 'Account Status', 'BES Roles'], oracleUsers.map((e) => [e.name, e.username, e.email, e.employeeNo, e.position ?? '', e.departmentCode ?? '', e.accountStatus, e.roles.join('; ')]))} />
            {usersLoading ? (
              <div className="rounded-lg border border-slate-200 p-5 text-sm text-slate-500">Loading users from Oracle BES_USERS…</div>
            ) : (
              <DataTable columns={userColumns} rows={userRows} getRowId={(e) => e.id} cardTitle={(e) => e.name} emptyTitle="No Oracle users found" emptyDescription="BES_USERS does not contain users matching this search." />
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'roles' && (
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-5 text-sm text-slate-600">
              <p className="mb-2 font-semibold text-slate-800">Access is determined by a combination of:</p>
              <div className="flex flex-wrap gap-1.5">
                {(roleConfig?.factors ?? []).map((f) => <Badge key={f} className="border-brand-200 bg-brand-50 text-brand-700">{f}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Active Role Assignments</CardTitle></CardHeader>
            <CardContent>
              {rolesLoading ? (
                <div className="rounded-lg border border-slate-200 p-5 text-sm text-slate-500">Loading assignments from Oracle BES_USER_ROLES...</div>
              ) : rolesError ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rolesError}</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(roleConfig?.assignments ?? []).map((assignment) => (
                    <div key={`${assignment.username}-${assignment.roleCode}-${assignment.departmentCode ?? 'all'}`} className="rounded-lg border border-slate-100 p-3">
                      <p className="text-sm font-semibold text-slate-800">{assignment.name}</p>
                      <p className="text-xs text-slate-500">{assignment.username}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge className={assignment.roleCode === 'Administrator' ? 'border-gold-200 bg-gold-50 text-gold-800' : 'border-brand-200 bg-brand-50 text-brand-700'}>
                          {assignment.roleCode}{assignment.departmentCode ? ` (${assignment.departmentCode})` : ''}
                        </Badge>
                        {assignment.note && <Badge className="border-slate-200 bg-slate-100 text-slate-600">{assignment.note}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Role and Permission Matrix</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {rolesLoading ? (
                <div className="rounded-lg border border-slate-200 p-5 text-sm text-slate-500">Loading matrix from Oracle BES_ROLE_PERMISSIONS...</div>
              ) : rolesError ? (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{rolesError}</div>
              ) : (
                <table className="w-full min-w-[820px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Role</th>
                      {(roleConfig?.permissions ?? []).map((permission) => <th key={permission.code} className="px-2 py-2 text-center font-semibold">{permission.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(roleConfig?.roles ?? []).map((role) => (
                      <tr key={role.code} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-800">{role.name}</td>
                        {(roleConfig?.permissions ?? []).map((permission) => (
                          <td key={permission.code} className="px-2 py-2 text-center">
                            {roleMatrix.get(`${role.code}:${permission.code}`) ? <Check className="mx-auto h-4 w-4 text-green-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'depts' && (
        <Card>
          <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Organizational Structure</CardTitle><p className="mt-1 text-xs text-slate-500">Oracle-backed departments, offices, sub-offices, positions, and employee classification.</p></div><Button size="sm" onClick={() => setOrgEditor({ entity: 'department', code: '', name: '' })}><Plus className="h-3.5 w-3.5" /> Add Department</Button></div></CardHeader>
          <CardContent className="space-y-3">
            {orgLoading && <p className="text-sm text-slate-500">Loading organizational structure…</p>}
            {!orgLoading && orgDepartments.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 px-5 py-8 text-center"><p className="text-sm text-slate-500">No organizational data was returned.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void loadOrgStructure()}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button></div>}
            {orgDepartments.map((department) => (
              <div key={department.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2"><button className="flex items-center gap-2 text-left" onClick={() => setCollapsedDepartments((current) => { const next = new Set(current); if (next.has(department.id)) next.delete(department.id); else next.add(department.id); return next; })}>{collapsedDepartments.has(department.id) ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}<span><span className="block text-sm font-semibold text-slate-800">{department.name} <Badge className="ml-1">{department.code}</Badge></span><span className="block text-xs text-slate-500">{department.offices.length} offices</span></span></button><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setOrgEditor({ entity: 'department', id: department.id, code: department.code, name: department.name })}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button variant="ghost" size="sm" onClick={() => setOrgEditor({ entity: 'position', departmentId: department.id, title: '', employeeClass: 'DEPARTMENT_MANAGER' })}><Plus className="h-3.5 w-3.5" /> Position</Button><Button variant="outline" size="sm" onClick={() => setOrgEditor({ entity: 'office', departmentId: department.id, name: '' })}><Plus className="h-3.5 w-3.5" /> Office</Button></div></div>
                {!collapsedDepartments.has(department.id) && <><div className="mt-2 space-y-1 pl-3">{[...department.positions].sort((a, b) => a.employeeClass.localeCompare(b.employeeClass)).map((position) => <button key={position.id} onClick={() => setOrgEditor({ entity: 'position', id: position.id, departmentId: department.id, title: position.title, employeeClass: position.employeeClass })} className="block rounded-md border border-brand-100 bg-brand-50 px-2.5 py-1.5 text-left text-xs text-brand-800"><span className="font-semibold">{ORG_CLASS_LABELS[position.employeeClass]}</span> — {position.title}</button>)}</div>
                <div className="mt-3 space-y-2 border-l-2 border-brand-100 pl-3">
                  {department.offices.map((office) => (
                    <div key={office.id} className="rounded-md bg-slate-50 p-2.5">
                      <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-slate-700">{office.name}</p><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setOrgEditor({ entity: 'office', id: office.id, departmentId: department.id, name: office.name, parentOfficeId: office.parentOfficeId ?? '' })}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button variant="ghost" size="sm" onClick={() => setOrgEditor({ entity: 'position', officeId: office.id, title: '', employeeClass: 'RAF' })}><Plus className="h-3.5 w-3.5" /> Position</Button></div></div>
                      <div className="mt-2 space-y-1">{[...office.positions].sort((a, b) => OFFICE_CLASS_ORDER.indexOf(a.employeeClass) - OFFICE_CLASS_ORDER.indexOf(b.employeeClass)).map((position) => <button key={position.id} onClick={() => setOrgEditor({ entity: 'position', id: position.id, officeId: office.id, title: position.title, employeeClass: position.employeeClass })} className={`block rounded-md border px-2 py-1 text-left text-xs hover:border-brand-300 ${position.employeeClass === 'SUPERVISOR' ? 'ml-4 border-brand-200 bg-brand-50 text-brand-700' : position.employeeClass === 'RAF' ? 'ml-8 border-slate-200 bg-slate-50 text-slate-600' : 'border-gold-200 bg-gold-50 text-gold-800'}`}><span className="font-semibold">{ORG_CLASS_LABELS[position.employeeClass]}</span> — {position.title}</button>)}{office.positions.length === 0 && <span className="text-xs text-slate-400">No positions yet</span>}</div>
                    </div>
                  ))}
                </div></>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'modules' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">Sidebar Items</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">{NAV_ITEMS.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">Department-Controlled</p>
                <p className="mt-1 text-2xl font-bold text-brand-600">{standardSidebarModuleCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-slate-500">{currentDepartmentCode ?? 'Current Dept.'} Enabled</p>
                <p className="mt-1 text-2xl font-bold text-gold-700">{currentDepartmentEnabledCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Sidebar Module Registry</CardTitle>
                <p className="mt-1 text-xs text-slate-500">
                  This registry mirrors every item in the left sidebar. Choose which departments can see each module; Administrator accounts always see everything.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetSidebarModuleAccess}><RotateCcw className="h-3.5 w-3.5" /> Reset Defaults</Button>
            </CardHeader>
            <CardContent>
              <Toolbar search={moduleSearch} onSearchChange={setModuleSearch} placeholder="Search sidebar modules…" />
              <div className="space-y-2">
                {filteredSidebarModules.map((item) => {
                  const Icon = item.icon;
                  const enabledDepartments = moduleAccess[item.to] ?? [];
                  return (
                    <div key={item.to} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4.5 w-4.5" /></span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                            <p className="font-mono text-xs text-slate-400">{item.to}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {item.adminOnly ? (
                                <Badge className="border-gold-200 bg-gold-50 text-gold-800">Administrator only</Badge>
                              ) : (
                                <>
                                  <Badge className="border-brand-200 bg-brand-50 text-brand-700">{enabledDepartments.length} departments enabled</Badge>
                                  {currentDepartmentCode && enabledDepartments.includes(currentDepartmentCode) && <Badge>{currentDepartmentCode} visible</Badge>}
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {item.adminOnly ? (
                          <div className="rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-xs text-gold-800 lg:max-w-xs">
                            Protected module. It is hidden from department menus and shown only to users with Administrator access.
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1 lg:max-w-2xl">
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              <Button variant="ghost" size="sm" onClick={() => setModuleForAllDepartments(item.to, true)}>Enable all</Button>
                              <Button variant="ghost" size="sm" onClick={() => setModuleForAllDepartments(item.to, false)}>Disable all</Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {departments.map((department) => (
                                <label key={department.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-sm text-slate-700 transition hover:border-brand-200 hover:bg-brand-50">
                                  <Checkbox
                                    checked={enabledDepartments.includes(department.id)}
                                    onChange={(event) => updateModuleDepartmentAccess(item.to, department.id, event.target.checked)}
                                  />
                                  <span className="min-w-0">
                                    <span className="block font-medium text-slate-800">{department.shortName}</span>
                                    <span className="block truncate text-xs text-slate-500">{department.name}</span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'tools' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Tool Access</CardTitle>
            <p className="text-xs text-slate-500">Who can access each department application-portal tool (GIS, OMS, WIS, etc.), and at what level.</p>
          </CardHeader>
          <CardContent>
            <Tabs
              tabs={toolDepartmentTabs.map((t) => ({
                value: t.value,
                label: t.label,
                count: t.value === 'ALL' ? tools.length : tools.filter((tool) => tool.ownerDepartmentId === t.value).length,
              }))}
              value={toolDeptTab}
              onChange={(v) => setToolDeptTab(v as DepartmentId | 'ALL')}
              className="mb-3"
            />
            <Toolbar search={toolSearch} onSearchChange={setToolSearch} placeholder="Search tools…" />
            <div className="space-y-2">
              {tools
                .filter((t) => toolDeptTab === 'ALL' || t.ownerDepartmentId === toolDeptTab)
                .filter((t) => !toolSearch.trim() || t.code.toLowerCase().includes(toolSearch.toLowerCase()) || t.name.toLowerCase().includes(toolSearch.toLowerCase()))
                .sort((left, right) => left.code.localeCompare(right.code, undefined, { sensitivity: 'base' }))
                .map((t) => {
                const Icon = getToolIcon(t.iconKey);
                return (
                  <div key={t.code} className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-4.5 w-4.5" /></span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">{t.code} <span className="font-normal text-slate-500">— {t.name}</span><Badge className={t.status === 'DISABLED' ? 'border-red-200 bg-red-50 text-red-700' : t.status === 'SOON' ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-green-200 bg-green-50 text-green-700'}>{t.status ?? 'ENABLED'}</Badge></p>
                        <p className="truncate text-xs text-slate-400">{t.description}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Owner: <span className="font-medium text-slate-600">{t.ownerDepartmentId}</span></p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                      {t.access.map((a) => (
                        <Badge key={`${a.departmentId}-${a.unit ?? ''}-${a.position ?? ''}`} className={LEVEL_BADGE_STYLES[a.level]}>
                          {a.departmentId}{a.unit ? ` · ${a.unit}` : ''}{a.position ? ` · ${a.position}` : ''}: {a.level}
                        </Badge>
                      ))}
                      {t.access.length === 0 && <span className="text-xs text-slate-400">No departments granted access</span>}
                      <Button variant="ghost" size="sm" onClick={() => setToolEdit(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'storage' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4" /> Storage Quotas</CardTitle>
            <p className="text-xs text-slate-500">Maximum personal file-storage space allotted per employee, and current usage.</p>
          </CardHeader>
          <CardContent>
            <Toolbar search={storageSearch} onSearchChange={setStorageSearch} placeholder="Search employees…" />
            <DataTable columns={storageColumns} rows={storageRows} getRowId={(e) => e.id} cardTitle={(e) => e.name} />
          </CardContent>
        </Card>
      )}

      {tab === 'workflows' && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Workflow Configuration Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">Read-only preview of configured approval routing. Changes to production workflow configuration require formal process-owner review.</p>
            {WORKFLOWS.map((w) => (
              <div key={w.processType} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-800">{w.name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  {PROCESS_DEFS[w.processType].approvalChain({}).map((s, i, arr) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-medium">{s.stepName}</span>
                      {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'news' && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>News and Memo Publishing</CardTitle>
            <Button size="sm" onClick={() => navigate('/news')}>Go to News and Memos <ArrowRight className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="mb-2 text-sm text-slate-500">Create, publish, schedule, and archive posts from the News and Memos module.</p>
            {news.slice(0, 6).map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-700">{n.title}</span>
                <Badge>{n.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'calendar' && (
        <Card>
          <CardHeader><CardTitle>Calendar Administration</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-500">Organizational calendar layers and events. Personal events remain user-managed from the Calendar module.</p>
            <div className="space-y-1.5">
              {orgEvents.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5 text-sm">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} /> {e.title}</span>
                  <Badge>{e.layer}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'docs' && (
        <Card>
          <CardHeader><CardTitle>Document Classification Levels</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {CLASS_STYLES_LIST.map((c) => (
              <div key={c.label} className="rounded-lg border border-slate-100 p-3">
                <Badge className={c.style}>{c.label}</Badge>
                <p className="mt-1.5 text-sm text-slate-600">{c.explanation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'refnum' && (
        <Card>
          <CardHeader><CardTitle>Reference Number Settings</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-500">Format: <code className="rounded bg-slate-100 px-1.5 py-0.5">BES-[PREFIX]-[YEAR]-[SEQUENCE]</code></p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {REFERENCE_PREFIXES.map((r) => (
                <div key={r.prefix} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-sm">
                  <span className="font-mono font-semibold text-brand-700">{r.prefix}</span>
                  <span className="text-slate-600">{r.process}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'notif' && (
        <Card>
          <CardHeader><CardTitle>Notification Templates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {NOTIFICATION_TEMPLATES.map((t) => (
              <div key={t.category} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.category}</p>
                  <p className="text-xs text-slate-500">Title: {t.title}</p>
                  <p className="text-xs text-slate-500">Message: {t.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setTemplateEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <CardHeader><CardTitle>Audit Logs</CardTitle></CardHeader>
          <CardContent>
            <Toolbar search={auditSearch} onSearchChange={setAuditSearch} placeholder="Search audit logs…" onExport={() => exportToCsv('audit-log.csv', ['Timestamp', 'Actor', 'Action', 'Target', 'Category', 'IP Address'], auditLog.map((a) => [a.timestamp, a.actor, a.action, a.target, a.category, a.ipAddress]))} />
            <DataTable columns={auditColumns} rows={auditRows} getRowId={(a) => a.id} cardTitle={(a) => a.action} />
          </CardContent>
        </Card>
      )}

      {tab === 'dbsync' && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Database Sync</CardTitle>
              <p className="text-xs text-slate-500">Sync selected BES application tables from this local Oracle schema to a server Oracle schema. This is restricted to Administrator accounts.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-950/5 dark:bg-white/5">
                <div className="flex flex-wrap border-b border-slate-200 text-xs">
                  {['General', 'Advanced', 'Databases', 'SSH', 'Remarks'].map((item) => (
                    <span key={item} className={`px-3 py-2 ${item === 'General' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'text-slate-500'}`}>{item}</span>
                  ))}
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="hidden items-center justify-center gap-5 text-slate-500 lg:flex">
                    <span className="flex flex-col items-center gap-2 text-xs"><PlugZap className="h-10 w-10" />Local</span>
                    <ArrowRight className="h-5 w-5" />
                    <span className="flex flex-col items-center gap-2 text-xs"><Server className="h-10 w-10" />Server</span>
                  </div>
                  <div className="grid gap-3">
                    <div><Label htmlFor="sync-connection-name">Connection Name</Label><Input id="sync-connection-name" value={syncConnection.connectionName} onChange={(e) => updateSyncConnection({ connectionName: e.target.value })} /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="sync-connection-type">Connection Type</Label>
                        <Select id="sync-connection-type" value={syncConnection.connectionType} onChange={() => updateSyncConnection({ connectionType: 'Basic' })}>
                          <option value="Basic">Basic</option>
                        </Select>
                      </div>
                      <div>
                        <Label>Connection Mode</Label>
                        <div className="mt-2 flex gap-4 text-sm text-slate-700">
                          <label className="flex items-center gap-2"><input type="radio" checked={syncConnection.mode === 'serviceName'} onChange={() => updateSyncConnection({ mode: 'serviceName' })} /> Service Name</label>
                          <label className="flex items-center gap-2"><input type="radio" checked={syncConnection.mode === 'sid'} onChange={() => updateSyncConnection({ mode: 'sid' })} /> SID</label>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                      <div><Label htmlFor="sync-host">Host</Label><Input id="sync-host" value={syncConnection.host} onChange={(e) => updateSyncConnection({ host: e.target.value })} placeholder="192.168.60.1" /></div>
                      <div><Label htmlFor="sync-port">Port</Label><Input id="sync-port" value={syncConnection.port} onChange={(e) => updateSyncConnection({ port: e.target.value })} placeholder="1521" /></div>
                    </div>
                    <div><Label htmlFor="sync-service">{syncConnection.mode === 'sid' ? 'SID' : 'Service Name'}</Label><Input id="sync-service" value={syncConnection.serviceName} onChange={(e) => updateSyncConnection({ serviceName: e.target.value })} placeholder="ORCL" /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><Label htmlFor="sync-username">User Name</Label><Input id="sync-username" value={syncConnection.username} onChange={(e) => updateSyncConnection({ username: e.target.value })} placeholder="ISD" /></div>
                      <div><Label htmlFor="sync-password">Password</Label><Input id="sync-password" type="password" value={syncConnection.password} onChange={(e) => updateSyncConnection({ password: e.target.value })} /></div>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <Checkbox checked={syncConnection.savePassword} onChange={(e) => updateSyncConnection({ savePassword: e.target.checked })} />
                        Save password for this browser session
                      </label>
                      <p className="mt-1 text-xs text-slate-500">
                        Required before the localhost Administrator sidebar can switch BES to this Server database.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" onClick={testSyncConnection} disabled={syncTesting}><PlugZap className="h-4 w-4" /> {syncTesting ? 'Testing...' : 'Test Connection'}</Button>
                      <Button variant="outline" onClick={loadDatabaseSyncTables} disabled={syncLoadingTables}><RefreshCw className="h-4 w-4" /> {syncLoadingTables ? 'Loading...' : 'Refresh Local Tables'}</Button>
                    </div>
                  </div>
                </div>
              </div>

              {syncMessage && (
                <div className={`rounded-md border px-3 py-2 text-sm ${syncMessage.toLowerCase().includes('ok') || syncMessage.toLowerCase().includes('completed') ? 'border-green-200 bg-green-50 text-green-700' : 'border-gold-200 bg-gold-50 text-gold-800'}`}>
                  {syncMessage}
                </div>
              )}

              <div className="rounded-lg border border-gold-200 bg-gold-50/70 p-3 text-sm text-gold-800">
                <p className="font-semibold">Sync direction and schema alignment</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex items-start gap-2 rounded-md border border-gold-200 p-2"><input type="radio" checked={syncDirection === 'push'} onChange={() => setSyncDirection('push')} /><span><strong className="block">Push</strong><span className="text-xs">Local → Server</span></span></label>
                  <label className="flex items-start gap-2 rounded-md border border-gold-200 p-2"><input type="radio" checked={syncDirection === 'pull'} onChange={() => setSyncDirection('pull')} /><span><strong className="block">Pull</strong><span className="text-xs">Server → Local</span></span></label>
                  <label className="flex items-start gap-2 rounded-md border border-gold-200 p-2"><input type="radio" checked={syncDirection === 'both'} onChange={() => setSyncDirection('both')} /><span><strong className="block">Both</strong><span className="text-xs">Push, then mirror back</span></span></label>
                </div>
                <p className="mt-2 text-xs">Missing compatible columns are added first. Rows with matching primary keys are updated, new rows are appended, and destination-only rows are preserved. New tables must already exist in both schemas.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Tables to Sync</CardTitle>
                <p className="text-xs text-slate-500">Business tables only. Session and password-reset tables are intentionally excluded.</p>
              </div>
              <Badge>{syncSelectedTables.length} selected</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setSyncSelectedTables(syncTables.map((table) => table.tableName))}>Select All</Button>
                <Button size="sm" variant="ghost" onClick={() => setSyncSelectedTables([])}>Clear</Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {syncTables.length === 0 && <p className="p-3 text-sm text-slate-500">{syncLoadingTables ? 'Loading local tables…' : 'No syncable BES tables found yet.'}</p>}
                {syncTables.map((table) => (
                  <label key={table.tableName} className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-slate-100 p-2 text-sm text-slate-700 hover:bg-slate-50">
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={syncSelectedTables.includes(table.tableName)}
                        onChange={(e) => setSyncSelectedTables((selected) => e.target.checked ? [...new Set([...selected, table.tableName])] : selected.filter((item) => item !== table.tableName))}
                      />
                      <span className="font-mono font-semibold">{table.tableName}</span>
                    </span>
                    <Badge>{table.rowCount.toLocaleString()} rows</Badge>
                  </label>
                ))}
              </div>
              {syncExcludedTables.length > 0 && (
                <div className="space-y-1 rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Excluded protected tables</p>
                  {syncExcludedTables.map((table) => (
                    <p key={table.tableName} className="text-xs text-slate-500"><span className="font-mono font-semibold">{table.tableName}</span> — {table.reason}</p>
                  ))}
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => setSchemaSyncConfirmOpen(true)} disabled={syncSelectedTables.length === 0 || schemaSyncRunning}>
                  <Database className="h-4 w-4" /> {schemaSyncRunning ? 'Pushing Schema...' : 'Push Schema Tables'}
                </Button>
                <Button onClick={() => setSyncConfirmOpen(true)} disabled={syncSelectedTables.length === 0 || syncRunning}>
                  <Database className="h-4 w-4" /> {syncRunning ? 'Syncing...' : 'Sync Selected Tables'}
                </Button>
              </div>
              {schemaSyncResult && (
                <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-800">Last schema push report</p>
                  {schemaSyncResult.tables.map((table) => <p key={table.tableName} className="text-xs text-blue-700">{table.tableName}: {table.created ? 'table created' : table.addedColumns.length ? `added ${table.addedColumns.join(', ')}` : 'already aligned'}</p>)}
                </div>
              )}
              {syncResult && (
                <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-semibold text-green-800">Last sync report</p>
                  {syncResult.tables.map((table) => (
                    <p key={`${table.direction}-${table.tableName}`} className="text-xs text-green-700">{table.direction ? `${table.direction} · ` : ''}{table.tableName}: {table.rowCount.toLocaleString()} rows, {table.columns} columns{table.addedColumns?.length ? ` · added ${table.addedColumns.join(', ')}` : ''}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'demo' && (
        <Card>
          <CardHeader><CardTitle>Demo Data Controls</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Clear Created Transactions</p>
                <p className="text-xs text-slate-500">Remove requests, events, and posts created during this session, restoring baseline mock data.</p>
              </div>
              <Button variant="outline" onClick={() => setClearOpen(true)}><RotateCcw className="h-4 w-4" /> Clear Transactions</Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-100 bg-red-50/40 p-3">
              <div>
                <p className="text-sm font-medium text-red-800">Reset All Demo Data</p>
                <p className="text-xs text-red-600">Permanently restore all default mock records and clear localStorage. You will be returned to the login screen.</p>
              </div>
              <Button variant="destructive" onClick={() => setResetOpen(true)}><Trash2 className="h-4 w-4" /> Reset Demo Data</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={resetOpen} onClose={() => setResetOpen(false)}
        onConfirm={() => { resetDemoData(); }}
        title="Reset All Demo Data" description="This will permanently clear all data created during this session and restore the original mock dataset. This cannot be undone."
        confirmLabel="Reset Everything" destructive
      />
      <ConfirmDialog
        open={clearOpen} onClose={() => setClearOpen(false)}
        onConfirm={() => { resetDemoData(); }}
        title="Clear Created Transactions" description="This will restore baseline mock data, removing transactions created during this demonstration session."
        confirmLabel="Clear Transactions" destructive
      />
      <ConfirmDialog
        open={syncConfirmOpen}
        onClose={() => setSyncConfirmOpen(false)}
        onConfirm={runSelectedDatabaseSync}
        title={`${syncDirection === 'push' ? 'Push to server' : syncDirection === 'pull' ? 'Pull from server' : 'Synchronize both directions'}?`}
        description={`${syncDirection === 'push' ? 'Local Oracle will append new server rows and update matching primary-key rows.' : syncDirection === 'pull' ? 'Server Oracle will append new local rows and update matching primary-key rows.' : 'Local and server Oracle will merge in both directions; matching rows follow the push-then-pull order.'} Destination-only rows are preserved and nothing is deleted. Missing compatible columns will be added. This affects ${syncSelectedTables.length} selected table${syncSelectedTables.length === 1 ? '' : 's'}.`}
        confirmLabel={syncRunning ? 'Syncing...' : 'Sync Tables'}
        destructive
      />

      <Dialog open={!!templateEdit} onClose={() => setTemplateEdit(null)} title={`Edit Template — ${templateEdit?.category ?? ''}`} size="md" footer={<Button onClick={() => { toast({ kind: 'success', title: 'Template updated (prototype)' }); setTemplateEdit(null); }}>Save</Button>}>
        {templateEdit && (
          <div className="space-y-3">
            <div><Label>Title</Label><Input defaultValue={templateEdit.title} /></div>
            <div><Label>Message</Label><Textarea defaultValue={templateEdit.message} /></div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!userEdit}
        onClose={() => setUserEdit(null)}
        title={`Edit Employee — ${userEdit?.name ?? ''}`}
        description="Update employee and account information stored in Oracle BES_USERS. Passwords are not editable from this administration form."
        size="lg"
        footer={
          <>
            <Button
              variant="destructive"
              onClick={() => setUserDeleteOpen(true)}
              disabled={userSaving || userDeleting || !userEdit || String(user?.id) === String(userEdit.id)}
              className="mr-auto"
            >
              <Trash2 className="h-4 w-4" /> {userDeleting ? 'Deleting...' : 'Delete Employee'}
            </Button>
            <Button variant="outline" onClick={() => setUserEdit(null)} disabled={userSaving || userDeleting}>Cancel</Button>
            <Button onClick={saveUserEdit} disabled={userSaving || userDeleting}>{userSaving ? 'Saving...' : 'Save Changes'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {userSaveError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{userSaveError}</div>}
          <div className="rounded-md border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-800">
            Password changes remain restricted to the password reset process.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="edit-employee-no" required>Employee ID</Label><Input id="edit-employee-no" value={userEditForm.employeeNo} onChange={(e) => setUserEditForm((f) => ({ ...f, employeeNo: e.target.value }))} /></div>
            <div><Label htmlFor="edit-username" required>Username</Label><Input id="edit-username" value={userEditForm.username} onChange={(e) => setUserEditForm((f) => ({ ...f, username: e.target.value }))} /></div>
            <div><Label htmlFor="edit-email" required>Email</Label><Input id="edit-email" type="email" value={userEditForm.email} onChange={(e) => setUserEditForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><Label htmlFor="edit-mobile">Mobile No.</Label><Input id="edit-mobile" value={userEditForm.mobileNo} onChange={(e) => setUserEditForm((f) => ({ ...f, mobileNo: e.target.value }))} /></div>
            <div><Label htmlFor="edit-first-name" required>First Name</Label><Input id="edit-first-name" value={userEditForm.firstName} onChange={(e) => setUserEditForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label htmlFor="edit-middle-name">Middle Name</Label><Input id="edit-middle-name" value={userEditForm.middleName} onChange={(e) => setUserEditForm((f) => ({ ...f, middleName: e.target.value }))} /></div>
            <div><Label htmlFor="edit-last-name" required>Last Name</Label><Input id="edit-last-name" value={userEditForm.lastName} onChange={(e) => setUserEditForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
            <div><Label htmlFor="edit-suffix">Suffix</Label><Input id="edit-suffix" value={userEditForm.suffix} onChange={(e) => setUserEditForm((f) => ({ ...f, suffix: e.target.value }))} /></div>
            <div><Label htmlFor="edit-department">Department</Label><Select id="edit-department" value={userEditForm.departmentCode} onChange={(e) => setUserEditForm((f) => ({ ...f, departmentCode: e.target.value, position: '', unitName: '' }))}><option value="">Select department</option>{userEditForm.departmentCode && !orgDepartments.some((department) => department.code === userEditForm.departmentCode) && <option value={userEditForm.departmentCode}>{userEditForm.departmentCode} — current value</option>}{orgDepartments.map((department) => <option key={department.id} value={department.code}>{department.code} — {department.name}</option>)}</Select></div>
            <div><Label htmlFor="edit-unit">Office / Unit</Label><Select id="edit-unit" value={userEditForm.unitName} onChange={(e) => setUserEditForm((f) => ({ ...f, unitName: e.target.value, position: '' }))} disabled={!employeeFormDepartment}><option value="">Department level / no office</option>{userEditForm.unitName && !employeeFormDepartment?.offices.some((office) => office.name === userEditForm.unitName) && <option value={userEditForm.unitName}>{userEditForm.unitName} — current value</option>}{employeeFormDepartment?.offices.map((office) => <option key={office.id} value={office.name}>{office.name}</option>)}</Select></div>
            <div><Label htmlFor="edit-position">Position</Label><Select id="edit-position" value={userEditForm.position} onChange={(e) => setUserEditForm((f) => ({ ...f, position: e.target.value }))} disabled={!employeeFormDepartment}><option value="">Select position</option>{userEditForm.position && !employeeFormPositions.some((position) => position.value === userEditForm.position) && <option value={userEditForm.position}>{userEditForm.position} — current value</option>}{employeeFormPositions.map((position) => <option key={`${position.value}:${position.label}`} value={position.value}>{position.label}</option>)}</Select></div>
            <div>
              <Label htmlFor="edit-employment-status">Employment Status</Label>
              <Select id="edit-employment-status" value={userEditForm.employmentStatus} onChange={(e) => setUserEditForm((f) => ({ ...f, employmentStatus: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Probationary">Probationary</option>
                <option value="Inactive">Inactive</option>
                <option value="Separated">Separated</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-account-status">Account Status</Label>
              <Select id="edit-account-status" value={userEditForm.accountStatus} onChange={(e) => setUserEditForm((f) => ({ ...f, accountStatus: e.target.value }))}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="LOCKED">LOCKED</option>
                <option value="DISABLED">DISABLED</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>Other BES Roles</Label>
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <label className="flex items-center gap-2 rounded-md border border-slate-100 p-2 text-sm font-medium text-slate-700">
                <Checkbox checked={hasAssignedRole('Administrator')} onChange={(e) => toggleAssignedRole('Administrator', e.target.checked)} />
                Administrator
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-500">Department and office roles are assigned automatically from the selected organizational Position. Administrator is an additional BES role.</p>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={userDeleteOpen}
        onClose={() => setUserDeleteOpen(false)}
        onConfirm={deleteUserEdit}
        title="Delete Employee"
        description={`This will disable ${userEdit?.name ?? 'this employee'}, remove active role assignments, sign them out of active sessions, and hide them from the active user list. Historical tasks and comments will be preserved.`}
        confirmLabel={userDeleting ? 'Deleting...' : 'Delete Employee'}
      />
      <ConfirmDialog
        open={schemaSyncConfirmOpen}
        onClose={() => setSchemaSyncConfirmOpen(false)}
        onConfirm={runSelectedSchemaPush}
        title="Push selected table structures to server?"
        description={`This will create missing selected tables and add missing local columns in the server Oracle schema. Existing server rows will not be copied or deleted. ${syncSelectedTables.length} table${syncSelectedTables.length === 1 ? '' : 's'} selected.`}
        confirmLabel={schemaSyncRunning ? 'Pushing Schema...' : 'Push Schema Tables'}
      />

      <Dialog open={!!orgEditor} onClose={() => setOrgEditor(null)} title={`${orgEditor?.id ? 'Edit' : 'Add'} ${orgEditor?.entity === 'department' ? 'Department' : orgEditor?.entity === 'office' ? 'Office / Sub-office' : 'Position'}`} size="sm" footer={<><Button variant="outline" onClick={() => setOrgEditor(null)} disabled={orgSaving}>Cancel</Button><Button onClick={saveOrganizationEditor} disabled={orgSaving}>{orgSaving ? 'Saving…' : 'Save'}</Button></>}>
        {orgEditor && <div className="space-y-3">
          {orgEditor.entity === 'department' && <><div><Label htmlFor="org-department-name" required>Department Name</Label><Input id="org-department-name" value={orgEditor.name ?? ''} onChange={(event) => setOrgEditor({ ...orgEditor, name: event.target.value })} placeholder="Institutional Services Department" /></div><div><Label htmlFor="org-department-code" required>Initials / Code</Label><Input id="org-department-code" value={orgEditor.code ?? ''} onChange={(event) => setOrgEditor({ ...orgEditor, code: event.target.value.toUpperCase() })} placeholder="ISD" /></div></>}
          {orgEditor.entity === 'office' && <><div><Label htmlFor="org-office-name" required>Office Name</Label><Input id="org-office-name" value={orgEditor.name ?? ''} onChange={(event) => setOrgEditor({ ...orgEditor, name: event.target.value })} placeholder="Human Resource Office" /></div><div><Label htmlFor="org-parent-office">Parent Office</Label><Select id="org-parent-office" value={orgEditor.parentOfficeId ?? ''} onChange={(event) => setOrgEditor({ ...orgEditor, parentOfficeId: event.target.value })}><option value="">None — top-level office</option>{orgDepartments.find((department) => department.id === orgEditor.departmentId)?.offices.filter((office) => office.id !== orgEditor.id).map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</Select><p className="mt-1 text-xs text-slate-500">Select a parent only when this is a sub-office.</p></div></>}
          {orgEditor.entity === 'position' && <><div><Label htmlFor="org-position-title" required>Position Title</Label><Input id="org-position-title" value={orgEditor.title ?? ''} onChange={(event) => setOrgEditor({ ...orgEditor, title: event.target.value })} /></div><div><Label htmlFor="org-position-class" required>Organizational Role</Label><Select id="org-position-class" value={orgEditor.employeeClass ?? 'RAF'} onChange={(event) => setOrgEditor({ ...orgEditor, employeeClass: event.target.value })}>{orgEditor.departmentId ? <><option value="DEPARTMENT_MANAGER">Department Manager</option><option value="DEPARTMENT_SECRETARY">Department Secretary</option></> : <><option value="OFFICE_SECRETARY">Office Secretary</option><option value="SUPERVISOR">Supervisor</option><option value="RAF">Rank-and-File (RAF)</option></>}</Select></div></>}
        </div>}
      </Dialog>

      <Dialog open={!!toolEdit} onClose={() => setToolEdit(null)} title={`Edit Access — ${toolEdit?.code ?? ''}`} description={toolEdit?.name} size="md">
        {toolEdit && (
          <ToolAccessEditor
            tool={toolEdit}
            departments={(orgDepartments.length ? orgDepartments.map((department) => ({ id: department.code as DepartmentId, shortName: department.code, name: department.name, positions: department.positions, units: department.offices.map((office) => ({ name: office.name, positions: office.positions })) })) : departments.map((d) => ({ id: d.id, shortName: d.shortName, name: d.name, positions: [], units: d.units.map((name) => ({ name, positions: [] })) })))}
            scopedDepartmentId={toolDeptTab === 'ALL' ? null : toolDeptTab}
            onClose={() => setToolEdit(null)}
          />
        )}
      </Dialog>

      <Dialog open={!!quotaEdit} onClose={() => setQuotaEdit(null)} title={`Edit Storage Quota — ${quotaEdit?.name ?? ''}`} size="sm">
        {quotaEdit && (
          <QuotaEditor employee={quotaEdit} quotaBytes={storageQuotaBytes(quotaEdit.id)} onClose={() => setQuotaEdit(null)} />
        )}
      </Dialog>
    </div>
  );
}
