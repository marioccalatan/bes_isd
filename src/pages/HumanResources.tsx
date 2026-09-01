import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, Building2, ChevronDown, ChevronRight, Download, FileSpreadsheet, Network, Paperclip, Pencil, Plus, Printer, Search, Settings, Trash2 } from 'lucide-react';
import { HroTaskProcessingDrawer } from '@/components/shared/HroTaskProcessingDrawer';
import { MemberProgramsCsr } from '@/components/member-programs/MemberProgramsCsr';
import { MemberProgramsOperations } from '@/components/member-programs/MemberProgramsOperations';
import { MemberProgramsPrograms } from '@/components/member-programs/MemberProgramsPrograms';
import { PageHeader } from '@/components/shared/PageHeader';
import { Toolbar } from '@/components/shared/Toolbar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Pagination } from '@/components/ui/pagination';
import { Drawer } from '@/components/ui/drawer';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useData } from '@/context/DataContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { exportToCsv } from '@/hooks/useTableControls';
import { deleteHrPositionRequirement, deleteHrProficiencyLevel, deleteHrServiceEvidence, deleteHrServiceRecord, deleteOrganizationNode, downloadHrServiceEvidence, fetchCsrRequests, fetchHrEmployees, fetchHrPositionRequirements, fetchHrProficiencyLevels, fetchHrServiceRecords, fetchHroToolTaskProcessing, fetchOrganization, fetchUserDirectory, saveHrPositionRequirement, saveHrProficiencyLevel, saveHrServiceRecord, saveOrganizationNode, updateHrEmployee, uploadHrServiceEvidence, type DirectoryUser, type HrEmployee, type HrPositionDetailKind, type HrPositionRequirement, type HrProficiencyLevel, type HrServiceRecord, type OrganizationNode, type PolicyTaskProcessing } from '@/lib/api';
import type { Priority, WorkItem } from '@/lib/types';
import type { WorkspaceModuleDef, WorkspaceRecord } from '@/lib/workspace';
import { formatDate } from '@/lib/utils';

const STATUS_STYLES: Record<WorkspaceRecord['status'], string> = {
  Active: 'border-brand-200 bg-brand-50 text-brand-700',
  Pending: 'border-gold-200 bg-gold-50 text-gold-800',
  Completed: 'border-green-200 bg-green-50 text-green-700',
  Ongoing: 'border-brand-200 bg-brand-50 text-brand-700',
  Scheduled: 'border-slate-200 bg-slate-100 text-slate-600',
};

function organizationDescendantCount(node: OrganizationNode, type: OrganizationNode['type']): number {
  return node.children.reduce((total, child) => total + (child.type === type ? (type === 'POSITION' ? child.quantity : 1) : 0) + organizationDescendantCount(child, type), 0);
}

function prioritizeGeneralManagerOffice(nodes: OrganizationNode[]): OrganizationNode[] {
  return [...nodes].sort((left, right) => {
    const leftIsOgm = left.code?.toUpperCase() === 'OGM';
    const rightIsOgm = right.code?.toUpperCase() === 'OGM';
    return leftIsOgm === rightIsOgm ? 0 : leftIsOgm ? -1 : 1;
  });
}

type OrganizationReportRow = { department: string; departmentCode: string; office: string; officeShort: string; position: string; role: string; level: number | ''; quantity: number | ''; plantilla: string };

function organizationReportRows(nodes: OrganizationNode[]): OrganizationReportRow[] {
  const rows: OrganizationReportRow[] = [];
  for (const department of prioritizeGeneralManagerOffice(nodes)) {
    for (const position of department.children.filter((node) => node.type === 'POSITION')) rows.push({ department: department.name, departmentCode: department.code ?? '', office: '', officeShort: '', position: position.name, role: position.positionType1 ?? '', level: position.level || 4, quantity: position.quantity || 1, plantilla: position.isPlantilla ? 'Yes' : 'No' });
    for (const office of department.children.filter((node) => node.type === 'OFFICE')) {
      const positions = office.children.filter((node) => node.type === 'POSITION');
      if (!positions.length) rows.push({ department: department.name, departmentCode: department.code ?? '', office: office.name, officeShort: office.officeShort ?? office.code ?? '', position: '', role: '', level: '', quantity: '', plantilla: '' });
      for (const position of positions) rows.push({ department: department.name, departmentCode: department.code ?? '', office: office.name, officeShort: office.officeShort ?? office.code ?? '', position: position.name, role: position.positionType1 ?? '', level: position.level || 4, quantity: position.quantity || 1, plantilla: position.isPlantilla ? 'Yes' : 'No' });
    }
  }
  return rows;
}

const escapeOrganizationReport = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

function orderedOrganizationChildren(node: OrganizationNode): Array<{ child: OrganizationNode; extraDepth: number }> {
  const positions = node.children.filter((child) => child.type === 'POSITION');
  const branches = node.children.filter((child) => child.type !== 'POSITION');
  const role = (position: OrganizationNode) => (position.positionType1 ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (node.type === 'DEPARTMENT') {
    const managers = positions.filter((position) => role(position).includes('MANAGER'));
    const secretaries = positions.filter((position) => role(position).includes('SECRETARY'));
    const remaining = positions.filter((position) => !role(position).includes('MANAGER') && !role(position).includes('SECRETARY'));
    return [
      ...managers.map((child) => ({ child, extraDepth: 1 })),
      ...remaining.map((child) => ({ child, extraDepth: 2 })),
      ...secretaries.map((child) => ({ child, extraDepth: 2 })),
      ...branches.map((child) => ({ child, extraDepth: 1 })),
    ];
  }
  const supervisors = positions.filter((position) => role(position).includes('SUPERVISOR') || role(position).includes('OFFICER'));
  const personnel = positions.filter((position) => !role(position).includes('SUPERVISOR') && !role(position).includes('OFFICER'));
  return [
    ...supervisors.map((child) => ({ child, extraDepth: 1 })),
    ...personnel.map((child) => ({ child, extraDepth: 2 })),
    ...branches.map((child) => ({ child, extraDepth: 1 })),
  ];
}

type OrganizationEditor = { entity: 'department' | 'office' | 'position'; id?: string; parentId?: string; scopeType?: 'DEPARTMENT' | 'OFFICE'; code?: string; name?: string; title?: string; employeeClass?: string; level?: number; quantity?: number; isPlantilla?: boolean; purpose?: string };
const organizationRoleNeedsQuantity = (role?: string) => ['SUPERVISOR', 'RAF', 'DEPARTMENT_SECRETARY', 'OFFICE_SECRETARY'].includes(role ?? '');

function OrganizationBranch({ node, depth = 0, canEdit, onAddOffice, onAddPosition, onEditDepartment, onEditPosition, onRequirements }: { node: OrganizationNode; depth?: number; canEdit?: boolean; onAddOffice: (department: OrganizationNode) => void; onAddPosition: (parent: OrganizationNode) => void; onEditDepartment: (department: OrganizationNode) => void; onEditPosition: (position: OrganizationNode) => void; onRequirements: (position: OrganizationNode, kind: 'qualifications' | 'duties') => void }) {
  const [collapsed, setCollapsed] = useState(node.type === 'DEPARTMENT');
  const isPosition = node.type === 'POSITION';
  const positionIndent = Math.min(depth, 3) * 32;
  if (isPosition) return <div className="relative flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-left before:absolute before:-left-4 before:top-1/2 before:h-px before:w-4 before:bg-slate-300" style={{ marginLeft: `${positionIndent}px`, width: `calc(100% - ${positionIndent}px)` }}>
    <BriefcaseBusiness className="h-4 w-4 shrink-0 text-slate-400" />
    <button type="button" disabled={!canEdit} onClick={() => onEditPosition(node)} className={`min-w-0 flex-1 text-left text-sm font-medium text-slate-700 ${canEdit ? 'hover:text-brand-700' : 'cursor-default'}`}>{node.name}</button>
    <Button variant="outline" size="sm" onClick={() => onRequirements(node, 'qualifications')}>Job Details</Button>
    {node.positionType1 && <Badge>{node.positionType1}</Badge>}
    {node.quantity > 1 && <Badge>Qty {node.quantity}</Badge>}
    <Badge className={node.isPlantilla ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-slate-100 text-slate-600'}>{node.isPlantilla ? 'Plantilla' : 'Non-plantilla'}</Badge>
  </div>;
  const officeCount = organizationDescendantCount(node, 'OFFICE');
  const positionCount = organizationDescendantCount(node, 'POSITION');
  return <div className={node.type === 'DEPARTMENT' ? 'overflow-hidden rounded-xl border border-slate-200 bg-surface' : ''} style={node.type === 'OFFICE' ? { marginLeft: `${Math.min(depth, 2) * 20}px` } : undefined}>
    <div className={`flex items-center transition hover:bg-brand-50/40 ${node.type === 'OFFICE' ? 'rounded-lg border border-slate-200 bg-slate-50' : ''}`}>
      <button type="button" onClick={() => setCollapsed((value) => !value)} className={`flex min-w-0 flex-1 items-center gap-3 text-left ${node.type === 'DEPARTMENT' ? 'px-4 py-3.5' : 'px-3 py-3'}`}>
        {collapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        {node.type === 'DEPARTMENT' ? <Building2 className="h-5 w-5 shrink-0 text-brand-600" /> : <Network className="h-4 w-4 shrink-0 text-brand-600" />}
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{node.name}</span><span className="block text-xs text-slate-500">{node.code || node.officeShort}</span></span>
        <span className="text-xs text-slate-500">{node.type === 'DEPARTMENT' ? `${officeCount} ${officeCount === 1 ? 'office' : 'offices'} · ${positionCount} ${positionCount === 1 ? 'position' : 'positions'}` : `${positionCount} ${positionCount === 1 ? 'position' : 'positions'}`}</span>
      </button>
      {canEdit && node.type === 'DEPARTMENT' && <button type="button" aria-label={`Edit ${node.name}`} onClick={() => onEditDepartment(node)} className="mr-3 rounded-md border border-slate-200 bg-surface p-2 text-slate-500 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Pencil className="h-4 w-4" /></button>}
    </div>
    {!collapsed && <div className={node.type === 'DEPARTMENT' ? 'space-y-2 border-t border-slate-100 px-4 py-3' : 'mt-2 space-y-2 border-l-2 border-slate-200 pl-1'}>
      {canEdit && <div className="flex flex-wrap gap-2 pb-1" style={{ marginLeft: `${Math.min(depth + 1, 3) * 16}px` }}>
        {node.type === 'DEPARTMENT' && <Button variant="outline" size="sm" onClick={() => onAddOffice(node)}><Plus className="h-3.5 w-3.5" /> Add Office</Button>}
        <Button variant="outline" size="sm" onClick={() => onAddPosition(node)}><Plus className="h-3.5 w-3.5" /> Add Position</Button>
      </div>}
      {orderedOrganizationChildren(node).map(({ child, extraDepth }) => <OrganizationBranch key={child.id} node={child} depth={depth + extraDepth} canEdit={canEdit} onAddOffice={onAddOffice} onAddPosition={onAddPosition} onEditDepartment={onEditDepartment} onEditPosition={onEditPosition} onRequirements={onRequirements} />)}
    </div>}
  </div>;
}

export default function HumanResources({ module, taskSubject }: { module: WorkspaceModuleDef; taskSubject?: string }) {
  const { token, user } = useAuth();
  const { workItems, departments, createTaskFromCalendarEvent } = useData();
  const { toast } = useToast();
  const [tab, setTab] = useState('tasks');
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [processingRecords, setProcessingRecords] = useState<PolicyTaskProcessing[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<WorkspaceRecord | null>(null);
  const [csrCount, setCsrCount] = useState(0);
  const [communityRelationsCount, setCommunityRelationsCount] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskControlNumber, setTaskControlNumber] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskAssignee, setTaskAssignee] = useState(user?.username ?? '');
  const [taskDepartment, setTaskDepartment] = useState(user?.departmentCode ?? '');
  const [taskPriority, setTaskPriority] = useState<Priority>('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('Corporate Social Responsibility');
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [organization, setOrganization] = useState<OrganizationNode[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [organizationEditor, setOrganizationEditor] = useState<OrganizationEditor | null>(null);
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationDelete, setOrganizationDelete] = useState<{ id: string; name: string; entity: 'department' | 'position' } | null>(null);
  const [requirementPanel, setRequirementPanel] = useState<{ position: OrganizationNode; kind: HrPositionDetailKind } | null>(null);
  const [requirements, setRequirements] = useState<HrPositionRequirement[]>([]);
  const [requirementLevelTab, setRequirementLevelTab] = useState('1');
  const [requirementForm, setRequirementForm] = useState<{ id?: string; positionLevel: number; subject: string; qualificationLevel: string; description: string }>({ positionLevel: 4, subject: '', qualificationLevel: '', description: '' });
  const [requirementEditorOpen, setRequirementEditorOpen] = useState(false);
  const [requirementSaving, setRequirementSaving] = useState(false);
  const [organizationSettingsOpen, setOrganizationSettingsOpen] = useState(false);
  const [organizationSettingsTab, setOrganizationSettingsTab] = useState('proficiency-levels');
  const [proficiencyLevels, setProficiencyLevels] = useState<HrProficiencyLevel[]>([]);
  const [proficiencyForm, setProficiencyForm] = useState<{ originalLevel?: number; profLevel: number; description: string }>({ profLevel: 1, description: '' });
  const [proficiencySaving, setProficiencySaving] = useState(false);
  const [employeeFilters, setEmployeeFilters] = useState<Record<string, string>>({});
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeSortKey, setEmployeeSortKey] = useState<string | null>('lastName');
  const [employeeSortDir, setEmployeeSortDir] = useState<'asc' | 'desc'>('asc');
  const [employeePage, setEmployeePage] = useState(1);
  const [selectedEmployee, setSelectedEmployee] = useState<HrEmployee | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({ lastName: '', firstName: '', middleName: '', currentPositionType: '', officialPositionType: '', positionLevel: '', dateHired: '' });
  const [employeeDialogTab, setEmployeeDialogTab] = useState('details');
  const [serviceRecords, setServiceRecords] = useState<HrServiceRecord[]>([]);
  const [serviceRecordsLoading, setServiceRecordsLoading] = useState(false);
  const [savingServiceRecord, setSavingServiceRecord] = useState(false);
  const [editingServiceRecordId, setEditingServiceRecordId] = useState<string | null>(null);
  const emptyServiceForm = { positionTitle: '', positionLevel: '', monthlySalary: '', effectiveStart: '', effectiveEnd: '', remarks: '' };
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const canEditOrganization = user?.role === 'Administrator' || user?.roles?.includes('Administrator');

  function printOrganization() {
    const rows = organizationReportRows(organization);
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) { toast({ kind: 'error', title: 'Unable to open print report', description: 'Allow pop-ups for this site, then try again.' }); return; }
    const body = rows.map((row) => `<tr><td>${escapeOrganizationReport(row.department)}</td><td>${escapeOrganizationReport(row.departmentCode)}</td><td>${escapeOrganizationReport(row.office)}</td><td>${escapeOrganizationReport(row.officeShort)}</td><td>${escapeOrganizationReport(row.position)}</td><td>${escapeOrganizationReport(row.role)}</td><td>${row.level}</td><td>${row.quantity}</td><td>${row.plantilla}</td></tr>`).join('');
    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>BES Organizational Structure</title><style>body{font:11px Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px;margin:0}p{color:#555;margin:5px 0 18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:6px;text-align:left;vertical-align:top}th{background:#dfeee5}@page{size:landscape;margin:12mm}@media print{body{padding:0}}</style></head><body><h1>BENECO Organizational Structure</h1><p>Department → Office → Position hierarchy · Printed ${escapeOrganizationReport(new Date().toLocaleString())}</p><table><thead><tr><th>Department</th><th>Code</th><th>Office</th><th>Office Short</th><th>Position</th><th>Role</th><th>Level</th><th>Quantity</th><th>Plantilla</th></tr></thead><tbody>${body}</tbody></table></body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(() => reportWindow.print(), 350);
  }

  function exportOrganizationToExcel() {
    const rows = organizationReportRows(organization);
    const body = rows.map((row) => `<tr><td>${escapeOrganizationReport(row.department)}</td><td>${escapeOrganizationReport(row.departmentCode)}</td><td>${escapeOrganizationReport(row.office)}</td><td>${escapeOrganizationReport(row.officeShort)}</td><td>${escapeOrganizationReport(row.position)}</td><td>${escapeOrganizationReport(row.role)}</td><td>${row.level}</td><td>${row.quantity}</td><td>${row.plantilla}</td></tr>`).join('');
    const workbook = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:6px}th{background:#dfeee5}</style></head><body><h2>BENECO Organizational Structure</h2><table><thead><tr><th>Department</th><th>Department Code</th><th>Office</th><th>Office Short</th><th>Position</th><th>Organizational Role</th><th>Level</th><th>Quantity</th><th>Plantilla</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
    const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `bes-organization-${new Date().toISOString().slice(0, 10)}.xls`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveOrganizationChange() {
    if (!token || !organizationEditor) return;
    setOrganizationSaving(true);
    try {
      await saveOrganizationNode(token, organizationEditor);
      const refreshed = await fetchOrganization(token);
      setOrganization(refreshed);
      setOrganizationEditor(null);
      toast({ kind: 'success', title: 'Organizational structure updated', description: 'The change was saved to Oracle.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to save organization', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setOrganizationSaving(false); }
  }

  async function removeOrganizationPosition() {
    if (!token || !organizationDelete) return;
    setOrganizationSaving(true);
    try {
      await deleteOrganizationNode(token, organizationDelete.id);
      setOrganization(await fetchOrganization(token));
      setOrganizationDelete(null); setOrganizationEditor(null);
      toast({ kind: 'success', title: `${organizationDelete.entity === 'department' ? 'Department' : 'Position'} deleted`, description: organizationDelete.entity === 'department' ? 'The department and its complete hierarchy were removed from the active organization.' : 'The position was removed from the active hierarchy.' });
    } catch (error) {
      toast({ kind: 'error', title: `Unable to delete ${organizationDelete.entity}`, description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setOrganizationSaving(false); }
  }

  async function openRequirements(position: OrganizationNode, kind: HrPositionDetailKind) {
    if (!token) return;
    setRequirementPanel({ position, kind });
    setRequirementLevelTab('1');
    setRequirementForm({ positionLevel: position.level || 4, subject: '', qualificationLevel: '', description: '' });
    try {
      const [items, levels] = await Promise.all([fetchHrPositionRequirements(token, position.id, kind), fetchHrProficiencyLevels(token)]);
      setRequirements(items); setProficiencyLevels(levels);
    }
    catch (error) { toast({ kind: 'error', title: 'Unable to load position details', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function switchRequirementKind(kind: HrPositionDetailKind) {
    if (!token || !requirementPanel || requirementPanel.kind === kind) return;
    setRequirementPanel((current) => current ? { ...current, kind } : current);
    setRequirementLevelTab('1');
    setRequirements([]);
    try { setRequirements(await fetchHrPositionRequirements(token, requirementPanel.position.id, kind)); }
    catch (error) { toast({ kind: 'error', title: 'Unable to load job details', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function printJobDetails() {
    if (!token || !requirementPanel) return;
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) { toast({ kind: 'error', title: 'Unable to open print report', description: 'Allow pop-ups for this site, then try again.' }); return; }
    try {
      const [qualifications, duties, specifications, levels] = await Promise.all([
        fetchHrPositionRequirements(token, requirementPanel.position.id, 'qualifications'),
        fetchHrPositionRequirements(token, requirementPanel.position.id, 'duties'),
        fetchHrPositionRequirements(token, requirementPanel.position.id, 'specifications'),
        fetchHrProficiencyLevels(token),
      ]);
      const matrixLevels = [...new Set([...qualifications, ...duties, ...specifications].map((item) => item.positionLevel))].sort((left, right) => left - right);
      const qualificationMatrix = new Map<string, { qualification: string; competency: string; values: Record<number, string> }>();
      for (const item of qualifications) {
        const associatedPrefix = /^Competency associated with:\s*/i;
        const hasAssociatedQualification = associatedPrefix.test(item.description || '');
        const qualification = hasAssociatedQualification ? item.description.replace(associatedPrefix, '').trim() : item.subject;
        const competency = hasAssociatedQualification ? item.subject : (item.qualificationLevel || item.description || 'General requirement');
        const key = `${qualification}\u0000${competency}`;
        const row = qualificationMatrix.get(key) ?? { qualification, competency, values: {} };
        const proficiencyMatch = (item.qualificationLevel || '').match(/(?:competency\s+level|proficiency\s+level|level)\s*(\d+)/i);
        row.values[item.positionLevel] = proficiencyMatch?.[1] || 'Required';
        qualificationMatrix.set(key, row);
      }
      const qualificationHeaders = matrixLevels.map((level) => `<th class="level-column">Position Level ${level}</th>`).join('');
      const qualificationRows = [...qualificationMatrix.values()].map((row, index) => `<tr><td class="item-number">${index + 1}</td><td>${escapeOrganizationReport(row.qualification)}</td><td>${escapeOrganizationReport(row.competency)}</td>${matrixLevels.map((level) => `<td class="level-value">${escapeOrganizationReport(row.values[level] || '')}</td>`).join('')}</tr>`).join('');
      const dutyMatrix = new Map<string, { subject: string; description: string; values: Record<number, string> }>();
      for (const item of duties) {
        const key = `${item.subject}\u0000${item.description || ''}`;
        const row = dutyMatrix.get(key) ?? { subject: item.subject, description: item.description || '', values: {} };
        row.values[item.positionLevel] = '✓';
        dutyMatrix.set(key, row);
      }
      const dutyGroups = new Map<string, Array<{ description: string; values: Record<number, string> }>>();
      for (const row of dutyMatrix.values()) dutyGroups.set(row.subject, [...(dutyGroups.get(row.subject) || []), { description: row.description, values: row.values }]);
      let dutyItemNumber = 0;
      const dutyRows = [...dutyGroups.entries()].map(([subject, rows]) => `<tr class="subject-row"><td colspan="${2 + matrixLevels.length}">${escapeOrganizationReport(subject)}</td></tr>${rows.map((row) => { dutyItemNumber += 1; return `<tr><td class="item-number">${dutyItemNumber}</td><td>${escapeOrganizationReport(row.description)}</td>${matrixLevels.map((level) => `<td class="level-value check-mark">${escapeOrganizationReport(row.values[level] || '')}</td>`).join('')}</tr>`; }).join('')}`).join('');
      const specificationRows = specifications.map((item, index) => `<tr><td class="item-number">${index + 1}</td><td>${escapeOrganizationReport(item.subject)}</td><td>${escapeOrganizationReport(item.description || '')}</td><td class="level-value">${item.positionLevel}</td></tr>`).join('');
      const levelRows = levels.map((item) => `<tr><td>${item.profLevel}</td><td>${escapeOrganizationReport(item.description)}</td></tr>`).join('');
      reportWindow.document.open();
      reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeOrganizationReport(requirementPanel.position.name)} Job Details</title><style>body{font:10px Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 7px}p{margin:4px 0 12px;line-height:1.45}.meta{color:#555}.purpose{padding:10px;border:1px solid #aaa;background:#f5f5f5}table{width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#dfeee5}.item-number{width:4%;text-align:center;vertical-align:middle}.qualification-matrix th:nth-child(2),.qualification-matrix td:nth-child(2){width:28%}.qualification-matrix th:nth-child(3),.qualification-matrix td:nth-child(3){width:24%}.duty-matrix th:nth-child(2),.duty-matrix td:nth-child(2){width:60%}.subject-row td{background:#eaf4ee;font-weight:bold;font-size:11px;padding:7px}.level-column{text-align:center;width:8%}.level-value{text-align:center;font-size:12px;font-weight:bold;vertical-align:middle}.level-value.check-mark{font-family:Arial,'Segoe UI Symbol',sans-serif;font-size:16px}@page{size:landscape;margin:10mm}@media print{body{padding:0}}</style></head><body><h1>${escapeOrganizationReport(requirementPanel.position.name)}</h1><p class="meta">Complete Job Details · Printed ${escapeOrganizationReport(new Date().toLocaleString())}</p>${requirementPanel.position.purpose ? `<h2>Position Purpose</h2><p class="purpose">${escapeOrganizationReport(requirementPanel.position.purpose)}</p>` : ''}<h2>Job Specifications</h2><table><thead><tr><th class="item-number">No.</th><th>Specification</th><th>Description</th><th style="width:90px">Position Level</th></tr></thead><tbody>${specificationRows || '<tr><td colspan="4">No job specifications recorded.</td></tr>'}</tbody></table><h2>Proficiency Level Guide</h2><table><thead><tr><th style="width:70px">Level</th><th>Description</th></tr></thead><tbody>${levelRows || '<tr><td colspan="2">No proficiency levels configured.</td></tr>'}</tbody></table><h2>Qualifications and Competencies Matrix</h2><table class="qualification-matrix"><thead><tr><th class="item-number">No.</th><th>Qualification</th><th>Competencies</th>${qualificationHeaders}</tr></thead><tbody>${qualificationRows || `<tr><td colspan="${3 + matrixLevels.length}">No qualifications recorded.</td></tr>`}</tbody></table><h2>Duties &amp; Responsibilities Matrix</h2><table class="duty-matrix"><thead><tr><th class="item-number">No.</th><th>Duties &amp; Responsibilities</th>${qualificationHeaders}</tr></thead><tbody>${dutyRows || `<tr><td colspan="${2 + matrixLevels.length}">No duties recorded.</td></tr>`}</tbody></table></body></html>`);
      reportWindow.document.close(); reportWindow.focus(); window.setTimeout(() => reportWindow.print(), 350);
    } catch (error) {
      reportWindow.close();
      toast({ kind: 'error', title: 'Unable to print job details', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  }

  async function openOrganizationSettings() {
    if (!token) return;
    setOrganizationSettingsTab('proficiency-levels');
    setProficiencyForm({ profLevel: 1, description: '' });
    setOrganizationSettingsOpen(true);
    try { setProficiencyLevels(await fetchHrProficiencyLevels(token)); }
    catch (error) { toast({ kind: 'error', title: 'Unable to load organization settings', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function submitProficiencyLevel() {
    if (!token || !proficiencyForm.description.trim()) return;
    setProficiencySaving(true);
    try {
      await saveHrProficiencyLevel(token, { profLevel: proficiencyForm.profLevel, description: proficiencyForm.description.trim() }, proficiencyForm.originalLevel);
      setProficiencyLevels(await fetchHrProficiencyLevels(token));
      setProficiencyForm({ profLevel: 1, description: '' });
      toast({ kind: 'success', title: 'Proficiency level saved', description: 'The proficiency definition was saved to Oracle.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to save proficiency level', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setProficiencySaving(false); }
  }

  async function removeProficiencyLevel(profLevel: number) {
    if (!token) return;
    setProficiencySaving(true);
    try {
      await deleteHrProficiencyLevel(token, profLevel);
      setProficiencyLevels((current) => current.filter((item) => item.profLevel !== profLevel));
      if (proficiencyForm.originalLevel === profLevel) setProficiencyForm({ profLevel: 1, description: '' });
      toast({ kind: 'success', title: 'Proficiency level deleted', description: `Level ${profLevel} was removed.` });
    } catch (error) { toast({ kind: 'error', title: 'Unable to delete proficiency level', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setProficiencySaving(false); }
  }

  function openRequirementEditor(item?: HrPositionRequirement) {
    setRequirementForm(item
      ? { id: item.id, positionLevel: item.positionLevel, subject: item.subject, qualificationLevel: item.qualificationLevel || '', description: item.description }
      : { positionLevel: Number(requirementLevelTab), subject: '', qualificationLevel: '', description: '' });
    setRequirementEditorOpen(true);
  }

  async function saveRequirement() {
    if (!token || !requirementPanel || !requirementForm.subject.trim()) return;
    setRequirementSaving(true);
    try {
      await saveHrPositionRequirement(token, requirementPanel.position.id, requirementPanel.kind, { ...requirementForm, subject: requirementForm.subject.trim(), qualificationLevel: requirementForm.qualificationLevel.trim() || null, description: requirementForm.description.trim() });
      setRequirements(await fetchHrPositionRequirements(token, requirementPanel.position.id, requirementPanel.kind));
      setRequirementLevelTab(String(requirementForm.positionLevel));
      setRequirementForm({ positionLevel: requirementForm.positionLevel, subject: '', qualificationLevel: '', description: '' });
      setRequirementEditorOpen(false);
      toast({ kind: 'success', title: requirementPanel.kind === 'qualifications' ? 'Qualification saved' : requirementPanel.kind === 'duties' ? 'Duty saved' : 'Job specification saved', description: 'The position detail was saved to Oracle.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to save', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setRequirementSaving(false); }
  }

  async function removeRequirement(item: HrPositionRequirement) {
    if (!token || !requirementPanel) return;
    setRequirementSaving(true);
    try { await deleteHrPositionRequirement(token, requirementPanel.kind, item.id); setRequirements((current) => current.filter((entry) => entry.id !== item.id)); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setRequirementSaving(false); }
  }

  useEffect(() => {
    if (!taskOpen || !token) return;
    fetchUserDirectory(token)
      .then((users) => { setDirectoryUsers(users); if (!taskAssignee && users.length) setTaskAssignee(user?.username ?? users[0].username); })
      .catch((error) => toast({ kind: 'error', title: 'Users not loaded', description: error instanceof Error ? error.message : 'Unable to load the employee directory.' }));
  }, [taskAssignee, taskOpen, toast, token, user?.username]);

  function openNewTask() {
    setTaskTitle(''); setTaskControlNumber(''); setTaskDescription(''); setTaskAssignee(user?.username ?? '');
    setTaskDepartment(user?.departmentCode ?? ''); setTaskPriority('Normal'); setTaskDueDate('');
    setNewTaskSubject('Corporate Social Responsibility'); setTaskOpen(true);
  }

  async function submitNewTask() {
    if (!taskTitle.trim()) { toast({ kind: 'error', title: 'Task title required', description: 'Enter a short title for the task.' }); return; }
    if (!taskAssignee) { toast({ kind: 'error', title: 'Assignee required', description: 'Select the employee who should receive this task.' }); return; }
    setSavingTask(true);
    const result = await createTaskFromCalendarEvent({ calendarEventId: '', controlNumber: taskControlNumber.trim() || undefined, title: taskTitle.trim(), description: taskDescription.trim() || undefined, assigneeUsername: taskAssignee, departmentId: taskDepartment || undefined, officeAssignment: 'Community Relations Office', taskSubject: newTaskSubject, priority: taskPriority, dueDate: taskDueDate || undefined });
    setSavingTask(false);
    if (!result.ok) { toast({ kind: 'error', title: 'Task not created', description: result.error }); return; }
    setTaskOpen(false);
    toast({ kind: 'success', title: 'Task created', description: `${result.task.id} was added here and to My Work.` });
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchHroToolTaskProcessing(token, module.id)
      .then((items) => { if (!cancelled) setProcessingRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: `Unable to load ${module.name} task details`, description: error instanceof Error ? error.message : 'Please try again.' }); });
    return () => { cancelled = true; };
  }, [module.id, module.name, toast, token]);

  useEffect(() => {
    if (!token || module.id !== 'member-programs') return;
    let cancelled = false;
    fetchCsrRequests(token)
      .then((items) => { if (!cancelled) { setCsrCount(items.filter((item) => item.programType !== 'Linkages').length); setCommunityRelationsCount(items.filter((item) => item.programType === 'Linkages').length); } })
      .catch(() => { if (!cancelled) { setCsrCount(0); setCommunityRelationsCount(0); } });
    return () => { cancelled = true; };
  }, [module.id, token]);

  useEffect(() => {
    if (!token || module.id !== 'human-resources') return;
    let cancelled = false;
    setEmployeesLoading(true);
    fetchHrEmployees(token)
      .then((items) => { if (!cancelled) setEmployees(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load employees', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setEmployeesLoading(false); });
    return () => { cancelled = true; };
  }, [module.id, toast, token]);

  useEffect(() => {
    if (!token || module.id !== 'human-resources' || tab !== 'organization' || organization.length) return;
    let cancelled = false;
    setOrganizationLoading(true);
    fetchOrganization(token)
      .then((items) => { if (!cancelled) setOrganization(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load organization', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setOrganizationLoading(false); });
    return () => { cancelled = true; };
  }, [module.id, organization.length, tab, toast, token]);

  const tasks = useMemo(() => workItems.filter((item) => {
    if (module.id === 'member-programs') {
      return ['community programs', 'corporate social responsibility', 'community relations']
        .includes(String(item.fields.taskSubject ?? '').trim().toLowerCase());
    }
    if (taskSubject) return String(item.fields.taskSubject ?? '').trim().toLowerCase() === taskSubject.toLowerCase();
    const office = String(item.fields.officeAssignment ?? '').toLowerCase();
    return office.split(/[,;|]/).some((value) => value.trim() === 'human resource office');
  }), [module.id, taskSubject, workItems]);

  const query = search.trim().toLowerCase();
  const visibleTasks = useMemo(() => !query ? tasks : tasks.filter((item) => [
    item.id, item.title, item.requestorName, item.assigneeName, item.fields.controlNumber, item.fields.taskSubject,
  ].some((value) => String(value ?? '').toLowerCase().includes(query))), [query, tasks]);
  const visibleRecords = useMemo(() => !query ? module.records : module.records.filter((record) => [
    record.title, record.subtitle, record.tag, record.status,
  ].some((value) => value.toLowerCase().includes(query))), [module.records, query]);

  const taskColumns: Column<WorkItem>[] = [
    { key: 'title', header: 'Task', render: (item) => <div><p className="font-medium text-slate-800">{item.title}</p><p className="mt-0.5 font-mono text-[11px] text-brand-700">{item.id}</p></div> },
    { key: 'controlNumber', header: 'Control No.', render: (item) => String(item.fields.controlNumber ?? '—') },
    { key: 'subject', header: 'Subject', render: (item) => String(item.fields.taskSubject ?? '—') },
    { key: 'createdBy', header: 'Created By', render: (item) => item.requestorName },
    { key: 'assignedTo', header: 'Assigned To', render: (item) => item.assigneeName ?? 'Unassigned' },
    { key: 'dateSubmitted', header: 'Date Submitted', render: (item) => formatDate(item.dateSubmitted) },
    { key: 'status', header: 'My Work Status', render: (item) => <StatusBadge status={item.status} /> },
    { key: 'processingStatus', header: `${module.name} Status`, render: (item) => <Badge>{processingRecords.find((record) => record.taskId === item.id)?.status ?? 'Received'}</Badge> },
  ];

  const selectedTask = selectedTaskId ? workItems.find((item) => item.id === selectedTaskId) ?? null : null;

  function replaceProcessingRecord(record: PolicyTaskProcessing) {
    setProcessingRecords((current) => current.some((item) => item.taskId === record.taskId)
      ? current.map((item) => item.taskId === record.taskId ? record : item)
      : [record, ...current]);
  }

  const recordColumns: Column<WorkspaceRecord>[] = [
    { key: 'title', header: 'Title', render: (record) => <span className="font-medium text-slate-800">{record.title}</span> },
    { key: 'subtitle', header: 'Detail', render: (record) => record.subtitle },
    { key: 'tag', header: 'Category', render: (record) => <Badge>{record.tag}</Badge> },
    { key: 'date', header: 'Date', render: (record) => formatDate(record.date) },
    { key: 'status', header: 'Status', render: (record) => <Badge className={STATUS_STYLES[record.status]}>{record.status}</Badge> },
  ];

  const employeeColumns: Column<HrEmployee>[] = [
    { key: 'employeeNo', header: 'Employee No.', sortable: true, filterable: true, render: (employee) => <span className="font-mono text-xs font-medium text-brand-700">{employee.employeeNo}</span> },
    { key: 'lastName', header: 'Last Name', sortable: true, filterable: true, render: (employee) => employee.lastName },
    { key: 'firstName', header: 'First Name', sortable: true, filterable: true, render: (employee) => employee.firstName },
    { key: 'middleName', header: 'Middle Name', sortable: true, filterable: true, render: (employee) => employee.middleName || '—' },
    { key: 'currentPositionType', header: 'Current Position', sortable: true, filterable: true, render: (employee) => employee.currentPositionType || '—' },
    { key: 'officialPositionType', header: 'Official Position', sortable: true, filterable: true, render: (employee) => employee.officialPositionType || '—' },
    { key: 'positionLevel', header: 'Level', sortable: true, filterable: true, render: (employee) => employee.positionLevel || '—' },
    { key: 'dateHired', header: 'Date Hired', sortable: true, filterable: true, render: (employee) => employee.dateHired ? formatDate(employee.dateHired) : '—' },
    { key: 'department', header: 'Department', sortable: true, filterable: true, render: (employee) => <div><p className="font-medium text-slate-800">{employee.departmentShort || employee.departmentId || '—'}</p>{employee.departmentName && <p className="mt-0.5 text-[11px] text-slate-500">{employee.departmentName}</p>}</div> },
  ];

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const generalQuery = employeeSearch.trim().toLowerCase();
    const generalMatch = !generalQuery || [employee.employeeNo, employee.lastName, employee.firstName, employee.middleName,
      employee.currentPositionType, employee.officialPositionType, employee.positionLevel, employee.dateHired, employee.departmentId, employee.departmentShort, employee.departmentName,
    ].some((value) => String(value ?? '').toLowerCase().includes(generalQuery));
    return generalMatch && employeeColumns.every((column) => {
    const filter = (employeeFilters[column.key] ?? '').trim().toLowerCase();
    if (!filter) return true;
    const value = column.key === 'department'
      ? [employee.departmentId, employee.departmentShort, employee.departmentName].filter(Boolean).join(' ')
      : String(employee[column.key as keyof HrEmployee] ?? '');
    return value.toLowerCase().includes(filter);
    });
  }).sort((left, right) => {
    if (!employeeSortKey) return 0;
    const value = (employee: HrEmployee) => employeeSortKey === 'department'
      ? employee.departmentShort ?? employee.departmentId ?? ''
      : String(employee[employeeSortKey as keyof HrEmployee] ?? '');
    return value(left).localeCompare(value(right), undefined, { numeric: true, sensitivity: 'base' }) * (employeeSortDir === 'asc' ? 1 : -1);
  }), [employeeFilters, employeeSearch, employeeSortDir, employeeSortKey, employees]);
  const employeePageSize = 25;
  const employeePageCount = Math.max(1, Math.ceil(filteredEmployees.length / employeePageSize));
  const safeEmployeePage = Math.min(employeePage, employeePageCount);
  const employeePageRows = filteredEmployees.slice((safeEmployeePage - 1) * employeePageSize, safeEmployeePage * employeePageSize);
  const employeeDepartmentCounts = useMemo(() => {
    const counts = new Map<string, { code: string; name: string; count: number }>();
    for (const employee of employees) {
      const code = employee.departmentShort || employee.departmentId || 'Unassigned';
      const name = employee.departmentName || (code === 'Unassigned' ? 'No department lookup' : code);
      const current = counts.get(code);
      if (current) current.count += 1;
      else counts.set(code, { code, name, count: 1 });
    }
    return [...counts.values()].sort((left, right) => left.code.localeCompare(right.code));
  }, [employees]);

  function toggleEmployeeSort(key: string) {
    if (employeeSortKey === key) setEmployeeSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setEmployeeSortKey(key); setEmployeeSortDir('asc'); }
    setEmployeePage(1);
  }

  function openEmployee(employee: HrEmployee) {
    setSelectedEmployee(employee);
    setEmployeeForm({
      lastName: employee.lastName,
      firstName: employee.firstName,
      middleName: employee.middleName ?? '',
      currentPositionType: employee.currentPositionType ?? '',
      officialPositionType: employee.officialPositionType ?? '',
      positionLevel: employee.positionLevel ?? '',
      dateHired: employee.dateHired ?? '',
    });
    setEmployeeDialogTab('details');
    setServiceRecords([]);
    setEditingServiceRecordId(null);
    setServiceForm(emptyServiceForm);
  }

  useEffect(() => {
    if (!token || !selectedEmployee || employeeDialogTab !== 'service-records') return;
    let cancelled = false; setServiceRecordsLoading(true);
    fetchHrServiceRecords(token, selectedEmployee.employeeNo)
      .then((items) => { if (!cancelled) setServiceRecords(items); })
      .catch((error) => { if (!cancelled) toast({ kind: 'error', title: 'Unable to load service records', description: error instanceof Error ? error.message : 'Please try again.' }); })
      .finally(() => { if (!cancelled) setServiceRecordsLoading(false); });
    return () => { cancelled = true; };
  }, [employeeDialogTab, selectedEmployee, toast, token]);

  function editServiceRecord(record: HrServiceRecord) {
    setEditingServiceRecordId(record.id);
    setServiceForm({ positionTitle: record.positionTitle, positionLevel: record.positionLevel ?? '', monthlySalary: record.monthlySalary == null ? '' : String(record.monthlySalary), effectiveStart: record.effectiveStart, effectiveEnd: record.effectiveEnd ?? '', remarks: record.remarks ?? '' });
  }

  async function submitServiceRecord() {
    if (!token || !selectedEmployee || !serviceForm.positionTitle.trim() || !serviceForm.effectiveStart) return;
    setSavingServiceRecord(true);
    try {
      await saveHrServiceRecord(token, selectedEmployee.employeeNo, { positionTitle: serviceForm.positionTitle.trim(), positionLevel: serviceForm.positionLevel.trim() || null, monthlySalary: serviceForm.monthlySalary ? Number(serviceForm.monthlySalary) : null, effectiveStart: serviceForm.effectiveStart, effectiveEnd: serviceForm.effectiveEnd || null, remarks: serviceForm.remarks.trim() || null }, editingServiceRecordId ?? undefined);
      setServiceRecords(await fetchHrServiceRecords(token, selectedEmployee.employeeNo)); setEditingServiceRecordId(null); setServiceForm(emptyServiceForm);
      toast({ kind: 'success', title: 'Service record saved', description: 'The employee’s historical service entry was saved.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to save service record', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSavingServiceRecord(false); }
  }

  async function removeServiceRecord(recordId: string) {
    if (!token) return;
    try { await deleteHrServiceRecord(token, recordId); setServiceRecords((current) => current.filter((record) => record.id !== recordId)); }
    catch (error) { toast({ kind: 'error', title: 'Unable to delete service record', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function attachServiceEvidence(recordId: string, file?: File) {
    if (!token || !file) return;
    try { const result = await uploadHrServiceEvidence(token, recordId, file); setServiceRecords((current) => current.map((record) => record.id === recordId ? { ...record, evidence: [...record.evidence, result.evidence] } : record)); toast({ kind: 'success', title: 'Evidence attached', description: file.name }); }
    catch (error) { toast({ kind: 'error', title: 'Unable to attach evidence', description: error instanceof Error ? error.message : 'Please try again.' }); }
  }

  async function saveEmployee() {
    if (!token || !selectedEmployee) return;
    if (!employeeForm.lastName.trim() || !employeeForm.firstName.trim()) {
      toast({ kind: 'error', title: 'Name required', description: 'Enter both the employee’s first and last name.' });
      return;
    }
    setSavingEmployee(true);
    try {
      const result = await updateHrEmployee(token, selectedEmployee.employeeNo, {
        lastName: employeeForm.lastName.trim(), firstName: employeeForm.firstName.trim(),
        middleName: employeeForm.middleName.trim() || null, currentPositionType: employeeForm.currentPositionType.trim() || null,
        officialPositionType: employeeForm.officialPositionType.trim() || null,
        positionLevel: employeeForm.positionLevel.trim() || null, dateHired: employeeForm.dateHired || null,
      });
      setEmployees((current) => current.map((employee) => employee.employeeNo === result.employee.employeeNo ? result.employee : employee));
      setSelectedEmployee(null);
      toast({ kind: 'success', title: 'Employee updated', description: `${result.employee.firstName} ${result.employee.lastName} was saved to the HR masterfile.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update employee', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSavingEmployee(false); }
  }

  return (
    <div>
      <PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} />
      {module.id !== 'member-programs' && <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {module.id === 'human-resources' ? <>
          <Card className="p-4"><p className="text-xs text-slate-500">Active Employees</p><p className="mt-1 text-2xl font-bold text-slate-900">{employees.length || '—'}</p></Card>
          <Card className="p-4 sm:col-span-2">
            <p className="text-xs font-medium text-slate-500">Employees per Department</p>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
              {employeeDepartmentCounts.map((department) => <div key={department.code} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1" title={department.name}><span className="truncate text-xs font-medium text-slate-700">{department.code}</span><span className="text-sm font-bold text-brand-700">{department.count}</span></div>)}
            </div>
          </Card>
        </> : module.stats.map((stat) => <Card key={stat.label} className="p-4"><p className="text-xs text-slate-500">{stat.label}</p><p className="mt-1 text-xl font-bold text-slate-900">{stat.value}</p></Card>)}
      </div>}

      <Tabs
        tabs={[{ value: 'tasks', label: 'Tasks', count: tasks.length }, ...(module.id === 'member-programs' ? [{ value: 'csr', label: 'CSR', count: csrCount }, { value: 'community-relations', label: 'Community Relations', count: communityRelationsCount }, { value: 'operations', label: 'Operations' }, { value: 'programs', label: 'Programs' }] : [...(module.id === 'human-resources' ? [{ value: 'employees', label: 'Employees', count: employees.length }, { value: 'organization', label: 'Organization', count: organization.length || undefined }] : []), { value: 'records', label: 'Records', count: module.records.length }]) ]}
        value={tab}
        onChange={(value) => { setTab(value); setSearch(''); }}
        className="mb-5"
      />

      {tab === 'csr' ? <MemberProgramsCsr onCountChange={setCsrCount} /> : tab === 'community-relations' ? <MemberProgramsCsr onCountChange={setCommunityRelationsCount} programType="Linkages" title="Linkages" description="Community linkages, evaluation, project requirements, events, and funding." requestLabel="Request" /> : tab === 'operations' ? <MemberProgramsOperations /> : tab === 'programs' ? <MemberProgramsPrograms /> : tab === 'organization' ? <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Organizational Structure</CardTitle><p className="mt-1 text-sm text-slate-500">Live Department → Office → Position hierarchy from BES_DEPARTMENTS, BES_OFFICES, and BES_POSITIONS.</p></div><div className="flex flex-wrap justify-end gap-2">{canEditOrganization && <Button variant="outline" onClick={() => void openOrganizationSettings()}><Settings className="h-4 w-4" /> Settings</Button>}<Button variant="outline" onClick={printOrganization} disabled={!organization.length}><Printer className="h-4 w-4" /> Print</Button><Button variant="outline" onClick={exportOrganizationToExcel} disabled={!organization.length}><FileSpreadsheet className="h-4 w-4" /> Export to Excel</Button>{canEditOrganization && <Button onClick={() => setOrganizationEditor({ entity: 'department', name: '', code: '' })}><Plus className="h-4 w-4" /> Add Department</Button>}</div></CardHeader>
        <CardContent>
          {organizationLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading organizational structure…</p> : organization.length ? <div className="space-y-3">{prioritizeGeneralManagerOffice(organization).map((department) => <OrganizationBranch key={department.id} node={department} canEdit={canEditOrganization} onAddOffice={(parent) => setOrganizationEditor({ entity: 'office', parentId: parent.id, name: '', code: '' })} onAddPosition={(parent) => setOrganizationEditor({ entity: 'position', parentId: parent.id, scopeType: parent.type as 'DEPARTMENT' | 'OFFICE', title: '', employeeClass: parent.type === 'DEPARTMENT' ? 'DEPARTMENT_MANAGER' : 'SUPERVISOR', level: 4, quantity: 1, isPlantilla: true })} onEditDepartment={(item) => setOrganizationEditor({ entity: 'department', id: item.id, name: item.name, code: item.code ?? '' })} onEditPosition={(position) => {
            const role = (position.positionType1 ?? '').toUpperCase();
            const employeeClass = role.includes('MANAGER') ? 'DEPARTMENT_MANAGER' : role.includes('SECRETARY') ? (position.officeShort ? 'OFFICE_SECRETARY' : 'DEPARTMENT_SECRETARY') : role.includes('SUPERVISOR') || role.includes('OFFICER') ? 'SUPERVISOR' : 'RAF';
            setOrganizationEditor({ entity: 'position', id: position.id, parentId: position.parentId ?? undefined, scopeType: position.officeShort ? 'OFFICE' : 'DEPARTMENT', title: position.name, employeeClass, level: position.level || 4, quantity: position.quantity || 1, isPlantilla: position.isPlantilla !== false, purpose: position.purpose || '' });
          }} onRequirements={(position, kind) => void openRequirements(position, kind)} />)}</div> : <p className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">No active organization records found.</p>}
        </CardContent>
      </Card> : tab === 'employees' ? <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div><CardTitle>Active Employees</CardTitle>
          <p className="mt-1 text-sm text-slate-500">Current employee masterfile records joined with the department lookup.</p></div>
          <a href="/workspace/human-resources/summary" target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-surface px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><BarChart3 className="h-4 w-4" /> Summary</a>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input aria-label="Search all employee fields" value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeePage(1); }} placeholder="Search all employee fields…" className="pl-9" />
              </div>
              <p className="text-xs text-slate-500">{employeesLoading ? 'Loading employees…' : `${filteredEmployees.length} of ${employees.length} active employees`}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEmployeeSearch(''); setEmployeeFilters({}); setEmployeePage(1); }}>Clear filters</Button>
              <Button variant="outline" size="sm" onClick={() => exportToCsv('active-employees.csv', ['EMPNO', 'E_LAST', 'E_FIRST', 'E_MIDDLE', 'CURRENT_POSITION_TYPE', 'OFFICIAL_POSITION_TYPE', 'POSITION_LEVEL', 'DATE_HIRED', 'DEPT_ID', 'DEPARTMENT'], filteredEmployees.map((employee) => [employee.employeeNo, employee.lastName, employee.firstName, employee.middleName ?? '', employee.currentPositionType ?? '', employee.officialPositionType ?? '', employee.positionLevel ?? '', employee.dateHired ?? '', employee.departmentId ?? '', employee.departmentName ?? '']))}>Export</Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
            </div>
          </div>
          <DataTable columns={employeeColumns} rows={employeePageRows} getRowId={(employee) => employee.employeeNo} onRowClick={openEmployee} sortKey={employeeSortKey} sortDir={employeeSortDir} onSort={toggleEmployeeSort} columnFilters={employeeFilters} onColumnFilterChange={(key, value) => { setEmployeeFilters((current) => ({ ...current, [key]: value })); setEmployeePage(1); }} cardTitle={(employee) => `${employee.lastName}, ${employee.firstName}`} emptyTitle="No active employees" emptyDescription="No active employee records match the current column filters." minWidthPx={1260} />
          {!employeesLoading && <Pagination page={safeEmployeePage} pageCount={employeePageCount} onChange={setEmployeePage} total={filteredEmployees.length} pageSize={employeePageSize} />}
        </CardContent>
      </Card> : <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div><CardTitle>{tab === 'tasks' ? `${module.name} Tasks` : `${module.name} Records`}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{tab === 'tasks' ? (taskSubject ? `Live My Work tasks whose subject is ${taskSubject}.` : 'Live My Work tasks assigned to the Human Resource Office.') : `${module.name} operational records.`}</p></div>
          {tab === 'tasks' && module.id === 'member-programs' && <Button onClick={openNewTask}><Plus className="h-4 w-4" /> New Task</Button>}
        </CardHeader>
        <CardContent>
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            placeholder={tab === 'tasks' ? 'Search task, control number, subject…' : 'Search records…'}
            onExport={tab === 'records' ? () => exportToCsv(`${module.id}.csv`, ['Title', 'Detail', 'Category', 'Date', 'Status'], module.records.map((record) => [record.title, record.subtitle, record.tag, record.date, record.status])) : undefined}
            onPrint={() => window.print()}
          />
          {tab === 'tasks' ? (
            <DataTable columns={taskColumns} rows={visibleTasks} getRowId={(item) => item.id} onRowClick={(item) => setSelectedTaskId(item.id)} cardTitle={(item) => item.title} emptyTitle={`No ${module.name} tasks`} emptyDescription={taskSubject ? `My Work tasks with the subject ${taskSubject} will appear here.` : 'Tasks assigned to the Human Resource Office will appear here.'} />
          ) : (
            <DataTable columns={recordColumns} rows={visibleRecords} getRowId={(record) => record.id} onRowClick={setSelectedRecord} cardTitle={(record) => record.title} />
          )}
        </CardContent>
      </Card>}

      <Dialog open={!!organizationEditor} onClose={() => { if (!organizationSaving) setOrganizationEditor(null); }} title={`${organizationEditor?.id ? 'Edit' : 'Add'} ${organizationEditor?.entity === 'department' ? 'Department' : organizationEditor?.entity === 'office' ? 'Office' : 'Position'}`} size="sm" footer={<>{organizationEditor?.id && ['department', 'position'].includes(organizationEditor.entity) && <Button variant="destructive" disabled={organizationSaving} onClick={() => setOrganizationDelete({ id: organizationEditor.id!, name: organizationEditor.entity === 'department' ? organizationEditor.name || 'this department' : organizationEditor.title || 'this position', entity: organizationEditor.entity as 'department' | 'position' })}><Trash2 className="h-4 w-4" /> Delete</Button>}<Button variant="outline" disabled={organizationSaving} onClick={() => setOrganizationEditor(null)}>Cancel</Button><Button disabled={organizationSaving || !organizationEditor || (organizationEditor.entity === 'department' ? !organizationEditor.name?.trim() || !organizationEditor.code?.trim() : organizationEditor.entity === 'office' ? !organizationEditor.name?.trim() : !organizationEditor.title?.trim())} onClick={() => void saveOrganizationChange()}>{organizationSaving ? 'Saving…' : organizationEditor?.id ? 'Update' : 'Save'}</Button></>}>
        {organizationEditor && <div className="space-y-4">
          {organizationEditor.entity === 'position' && <div><Label>Purpose</Label><Textarea value={organizationEditor.purpose ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, purpose: event.target.value })} rows={4} placeholder="Describe the primary purpose of this position." /></div>}
          {organizationEditor.entity === 'department' && <><div><Label required>Department Name</Label><Input value={organizationEditor.name ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, name: event.target.value })} placeholder="Institutional Services Department" autoFocus /></div><div><Label required>Initials / Code</Label><Input value={organizationEditor.code ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, code: event.target.value.toUpperCase() })} placeholder="ISD" /></div></>}
          {organizationEditor.entity === 'office' && <><div><Label required>Office Name</Label><Input value={organizationEditor.name ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, name: event.target.value })} placeholder="Human Resource Office" autoFocus /></div><div><Label>Office Short</Label><Input value={organizationEditor.code ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, code: event.target.value.toUpperCase() })} placeholder="HRO" /></div></>}
          {organizationEditor.entity === 'position' && <><div><Label required>Position Title</Label><Input value={organizationEditor.title ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, title: event.target.value })} autoFocus /></div><div><Label required>Organizational Role</Label><Select value={organizationEditor.employeeClass ?? ''} onChange={(event) => setOrganizationEditor({ ...organizationEditor, employeeClass: event.target.value, quantity: 1 })}>{organizationEditor.scopeType === 'DEPARTMENT' ? <><option value="DEPARTMENT_MANAGER">Department Manager</option><option value="RAF">Personnel</option><option value="DEPARTMENT_SECRETARY">Department Secretary</option></> : <><option value="SUPERVISOR">Officer / Supervisor</option><option value="RAF">Personnel</option><option value="OFFICE_SECRETARY">Office Secretary</option></>}</Select></div><div><Label required>Level</Label><Select value={String(organizationEditor.level ?? 4)} onChange={(event) => setOrganizationEditor({ ...organizationEditor, level: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>{level}</option>)}</Select></div>{organizationRoleNeedsQuantity(organizationEditor.employeeClass) && <div><Label required>Quantity</Label><Input type="number" min="1" step="1" value={organizationEditor.quantity ?? 1} onChange={(event) => setOrganizationEditor({ ...organizationEditor, quantity: Math.max(1, Number(event.target.value) || 1) })} /><p className="mt-1 text-xs text-slate-500">Stores the number of plantilla positions without creating duplicate rows.</p></div>}<label className="flex items-center gap-2 text-sm text-slate-700"><Checkbox checked={organizationEditor.isPlantilla !== false} onChange={(event) => setOrganizationEditor({ ...organizationEditor, isPlantilla: event.target.checked })} /> Plantilla position</label></>}
        </div>}
      </Dialog>
      <ConfirmDialog open={!!organizationDelete} onClose={() => setOrganizationDelete(null)} onConfirm={() => void removeOrganizationPosition()} title={`Delete ${organizationDelete?.entity === 'department' ? 'Department' : 'Position'}?`} description={organizationDelete?.entity === 'department' ? `Remove ${organizationDelete.name} and all of its offices and positions from the active hierarchy?` : `Remove ${organizationDelete?.name ?? 'this position'} from the active organizational hierarchy?`} confirmLabel={organizationSaving ? 'Deleting…' : 'Delete'} destructive />

      <Dialog open={organizationSettingsOpen} onClose={() => { if (!proficiencySaving) setOrganizationSettingsOpen(false); }} title="Organization Settings" description="Configure Human Resources organization reference data." size="lg" footer={<Button variant="outline" onClick={() => setOrganizationSettingsOpen(false)}>Close</Button>}>
        <Tabs tabs={[{ value: 'proficiency-levels', label: 'Proficiency Levels', count: proficiencyLevels.length }]} value={organizationSettingsTab} onChange={setOrganizationSettingsTab} className="mb-5" />
        {organizationSettingsTab === 'proficiency-levels' && <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">{proficiencyForm.originalLevel == null ? 'Add Proficiency Level' : `Edit Proficiency Level ${proficiencyForm.originalLevel}`}</p>
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]"><div><Label required>PROF_LEVEL</Label><Select value={String(proficiencyForm.profLevel)} onChange={(event) => setProficiencyForm((current) => ({ ...current, profLevel: Number(event.target.value) }))}>{[1,2,3,4,5].map((level) => <option key={level} value={level}>{level}</option>)}</Select></div><div><Label required>DESCRIPTION</Label><Textarea value={proficiencyForm.description} onChange={(event) => setProficiencyForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Describe the proficiency level." /></div></div>
            <div className="mt-3 flex justify-end gap-2">{proficiencyForm.originalLevel != null && <Button variant="outline" onClick={() => setProficiencyForm({ profLevel: 1, description: '' })}>Cancel Edit</Button>}<Button disabled={proficiencySaving || !proficiencyForm.description.trim()} onClick={() => void submitProficiencyLevel()}>{proficiencySaving ? 'Saving…' : proficiencyForm.originalLevel == null ? 'Add Level' : 'Update Level'}</Button></div>
          </div>
          <div className="space-y-2">{proficiencyLevels.map((item) => <div key={item.profLevel} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4"><Badge>Level {item.profLevel}</Badge><p className="min-w-0 flex-1 text-sm leading-6 text-slate-700">{item.description}</p><div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => setProficiencyForm({ originalLevel: item.profLevel, profLevel: item.profLevel, description: item.description })}>Edit</Button><Button variant="destructive" size="sm" disabled={proficiencySaving} onClick={() => void removeProficiencyLevel(item.profLevel)}>Delete</Button></div></div>)}{!proficiencyLevels.length && <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No proficiency levels configured.</p>}</div>
        </div>}
      </Dialog>

      <Dialog open={!!requirementPanel} onClose={() => { setRequirementEditorOpen(false); setRequirementPanel(null); }} title="Job Details" description={requirementPanel ? `${requirementPanel.position.name} · Level ${requirementPanel.position.level || 4}` : undefined} size="2xl" headerActions={<><Button variant="outline" size="sm" onClick={() => void printJobDetails()}><Printer className="h-4 w-4" /> Print</Button>{canEditOrganization && <Button size="sm" onClick={() => openRequirementEditor()}><Plus className="h-4 w-4" /> Add {requirementPanel?.kind === 'qualifications' ? 'Qualification' : requirementPanel?.kind === 'duties' ? 'Duty' : 'Specification'}</Button>}</>} footer={<Button variant="outline" onClick={() => setRequirementPanel(null)}>Close</Button>}>
        <div className="space-y-4">
          <Tabs className="!overflow-visible flex-wrap" tabs={[{ value: 'qualifications', label: 'Qualifications' }, { value: 'duties', label: 'Duties & Responsibilities' }, { value: 'specifications', label: 'Specifications' }]} value={requirementPanel?.kind ?? 'qualifications'} onChange={(value) => void switchRequirementKind(value as HrPositionDetailKind)} />
          <Tabs className="!overflow-visible flex-wrap" tabs={[1,2,3,4,5].map((level) => ({ value: String(level), label: `Level ${level}`, count: requirements.filter((item) => item.positionLevel === level).length }))} value={requirementLevelTab} onChange={setRequirementLevelTab} />
          {requirementPanel?.kind === 'qualifications' && proficiencyLevels.length > 0 && <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">Proficiency Level Guide</p><div className="grid gap-2 lg:grid-cols-3">{proficiencyLevels.map((item) => <p key={item.profLevel} className="text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-800">Level {item.profLevel}:</span> {item.description}</p>)}</div></div>}
          <div className="space-y-2">{requirements.filter((item) => item.positionLevel === Number(requirementLevelTab)).map((item) => <div key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><Badge>Level {item.positionLevel}</Badge><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{item.subject}</p>{item.qualificationLevel && <p className="mt-0.5 text-sm font-medium text-brand-700">{item.qualificationLevel}</p>}<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.description || '—'}</p></div>{canEditOrganization && <div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => openRequirementEditor(item)}>Edit</Button><Button variant="destructive" size="sm" disabled={requirementSaving} onClick={() => void removeRequirement(item)}>Delete</Button></div>}</div>)}{!requirements.some((item) => item.positionLevel === Number(requirementLevelTab)) && <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">No records added for Level {requirementLevelTab} yet.</p>}</div>
        </div>
      </Dialog>

      <Dialog open={requirementEditorOpen} onClose={() => { if (!requirementSaving) setRequirementEditorOpen(false); }} title={`${requirementForm.id ? 'Edit' : 'Add'} ${requirementPanel?.kind === 'qualifications' ? 'Qualification' : requirementPanel?.kind === 'duties' ? 'Duty' : 'Job Specification'}`} description={requirementPanel?.position.name} size="sm" footer={<><Button variant="outline" disabled={requirementSaving} onClick={() => setRequirementEditorOpen(false)}>Cancel</Button><Button disabled={requirementSaving || !requirementForm.subject.trim()} onClick={() => void saveRequirement()}>{requirementSaving ? 'Saving…' : requirementForm.id ? 'Update' : 'Add'}</Button></>}>
        <div className="space-y-4">
          <div><Label>Position Level</Label><Select value={String(requirementForm.positionLevel)} onChange={(event) => setRequirementForm((current) => ({ ...current, positionLevel: Number(event.target.value) }))}>{[1,2,3,4,5].map((level) => <option key={level} value={level}>{level}</option>)}</Select></div>
          <div><Label required>{requirementPanel?.kind === 'specifications' ? 'Specification' : 'Subject'}</Label><Input value={requirementForm.subject} onChange={(event) => setRequirementForm((current) => ({ ...current, subject: event.target.value }))} placeholder={requirementPanel?.kind === 'qualifications' ? 'e.g. Driving Skills' : requirementPanel?.kind === 'duties' ? 'Duty or responsibility' : 'e.g. Educational Attainment, License, Sex, Age'} autoFocus /></div>
          {requirementPanel?.kind === 'qualifications' && <div><Label>Qualification / Requirement</Label><Input value={requirementForm.qualificationLevel} onChange={(event) => setRequirementForm((current) => ({ ...current, qualificationLevel: event.target.value }))} placeholder="e.g. Licensed, College Graduate" /></div>}
          <div><Label>Description</Label><Textarea value={requirementForm.description} onChange={(event) => setRequirementForm((current) => ({ ...current, description: event.target.value }))} rows={5} placeholder={requirementPanel?.kind === 'specifications' ? 'e.g. College graduate, Licensed Electrical Engineer, 21–35 years old' : 'Describe the qualification or responsibility.'} /></div>
        </div>
      </Dialog>

      <HroTaskProcessingDrawer
        open={!!selectedTask}
        task={selectedTask}
        moduleId={module.id}
        moduleName={module.name}
        processing={selectedTask ? processingRecords.find((record) => record.taskId === selectedTask.id) : undefined}
        onClose={() => setSelectedTaskId(null)}
        onSaved={replaceProcessingRecord}
      />

      <Dialog open={!!selectedEmployee} onClose={() => { if (!savingEmployee && !savingServiceRecord) setSelectedEmployee(null); }} title="Employee Record" description={selectedEmployee ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} · Employee ${selectedEmployee.employeeNo}` : undefined} size="xl" footer={employeeDialogTab === 'details' ? <><Button variant="outline" disabled={savingEmployee} onClick={() => setSelectedEmployee(null)}>Cancel</Button><Button disabled={savingEmployee} onClick={() => void saveEmployee()}>{savingEmployee ? 'Saving…' : 'Save Changes'}</Button></> : <Button variant="outline" onClick={() => setSelectedEmployee(null)}>Close</Button>}>
        <Tabs tabs={[{ value: 'details', label: 'Details' }, { value: 'service-records', label: 'Service Records', count: serviceRecords.length }]} value={employeeDialogTab} onChange={setEmployeeDialogTab} className="mb-5" />
        {employeeDialogTab === 'details' ? <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-first-name" required>First name</Label><Input id="employee-first-name" value={employeeForm.firstName} onChange={(event) => setEmployeeForm((current) => ({ ...current, firstName: event.target.value }))} /></div>
            <div><Label htmlFor="employee-middle-name">Middle name</Label><Input id="employee-middle-name" value={employeeForm.middleName} onChange={(event) => setEmployeeForm((current) => ({ ...current, middleName: event.target.value }))} /></div>
          </div>
          <div><Label htmlFor="employee-last-name" required>Last name</Label><Input id="employee-last-name" value={employeeForm.lastName} onChange={(event) => setEmployeeForm((current) => ({ ...current, lastName: event.target.value }))} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-current-position">Current position</Label><Input id="employee-current-position" value={employeeForm.currentPositionType} onChange={(event) => setEmployeeForm((current) => ({ ...current, currentPositionType: event.target.value }))} /></div>
            <div><Label htmlFor="employee-position">Official position</Label><Input id="employee-position" value={employeeForm.officialPositionType} onChange={(event) => setEmployeeForm((current) => ({ ...current, officialPositionType: event.target.value }))} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="employee-position-level">Position level</Label><Input id="employee-position-level" value={employeeForm.positionLevel} onChange={(event) => setEmployeeForm((current) => ({ ...current, positionLevel: event.target.value }))} /></div>
            <div><Label htmlFor="employee-date-hired">Date hired</Label><Input id="employee-date-hired" type="date" value={employeeForm.dateHired} onChange={(event) => setEmployeeForm((current) => ({ ...current, dateHired: event.target.value }))} /></div>
          </div>
        </div> : <div className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-800">{editingServiceRecordId ? 'Edit Service Record' : 'Add Service Record'}</p><p className="text-xs text-slate-500">Historical position, level, salary, and effectivity.</p></div>{editingServiceRecordId && <Button variant="ghost" size="sm" onClick={() => { setEditingServiceRecordId(null); setServiceForm(emptyServiceForm); }}>Cancel edit</Button>}</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2"><Label required>Position</Label><Input value={serviceForm.positionTitle} onChange={(event) => setServiceForm((current) => ({ ...current, positionTitle: event.target.value }))} placeholder="Position title" /></div>
              <div><Label>Position level</Label><Input value={serviceForm.positionLevel} onChange={(event) => setServiceForm((current) => ({ ...current, positionLevel: event.target.value }))} /></div>
              <div><Label>Monthly salary</Label><Input type="number" min="0" step="0.01" value={serviceForm.monthlySalary} onChange={(event) => setServiceForm((current) => ({ ...current, monthlySalary: event.target.value }))} placeholder="0.00" /></div>
              <div><Label required>Effective start</Label><Input type="date" value={serviceForm.effectiveStart} onChange={(event) => setServiceForm((current) => ({ ...current, effectiveStart: event.target.value }))} /></div>
              <div><Label>Effective end</Label><Input type="date" value={serviceForm.effectiveEnd} onChange={(event) => setServiceForm((current) => ({ ...current, effectiveEnd: event.target.value }))} /></div>
              <div className="sm:col-span-2 lg:col-span-3"><Label>Remarks</Label><Textarea value={serviceForm.remarks} onChange={(event) => setServiceForm((current) => ({ ...current, remarks: event.target.value }))} placeholder="Appointment, promotion, reclassification, or supporting notes" /></div>
            </div>
            <div className="mt-3 flex justify-end"><Button disabled={savingServiceRecord || !serviceForm.positionTitle.trim() || !serviceForm.effectiveStart} onClick={() => void submitServiceRecord()}><Plus className="h-4 w-4" /> {savingServiceRecord ? 'Saving…' : editingServiceRecordId ? 'Update Record' : 'Add Record'}</Button></div>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-slate-800">Service History</p>
            {serviceRecordsLoading ? <p className="py-8 text-center text-sm text-slate-500">Loading service records…</p> : serviceRecords.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">No service records yet.</p> : <div className="space-y-3">{serviceRecords.map((record) => <div key={record.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{record.positionTitle}</p><p className="mt-0.5 text-xs text-slate-500">{record.effectiveStart} to {record.effectiveEnd || 'Present'} · Level {record.positionLevel || '—'} · {record.monthlySalary == null ? 'Salary not recorded' : `₱${record.monthlySalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</p>{record.remarks && <p className="mt-2 text-sm text-slate-600">{record.remarks}</p>}</div><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Edit service record" onClick={() => editServiceRecord(record)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label="Delete service record" onClick={() => void removeServiceRecord(record.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>
              <div className="mt-3 border-t border-slate-100 pt-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-slate-500">Evidence</span>{record.evidence.map((evidence) => <span key={evidence.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"><button className="inline-flex items-center gap-1 hover:text-brand-700" onClick={() => token && void downloadHrServiceEvidence(token, evidence)}><Download className="h-3 w-3" />{evidence.fileName}</button><button aria-label={`Delete ${evidence.fileName}`} className="ml-1 text-slate-400 hover:text-red-600" onClick={() => token && void deleteHrServiceEvidence(token, evidence.id).then(() => setServiceRecords((current) => current.map((item) => item.id === record.id ? { ...item, evidence: item.evidence.filter((file) => file.id !== evidence.id) } : item)))}>×</button></span>)}<label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><Paperclip className="h-3.5 w-3.5" /> Attach file<input type="file" className="hidden" onChange={(event) => { void attachServiceEvidence(record.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div></div>
            </div>)}</div>}
          </div>
        </div>}
      </Dialog>

      <Drawer open={!!selectedRecord} onClose={() => setSelectedRecord(null)} title={selectedRecord?.title ?? 'Record'}>
        {selectedRecord && <div className="space-y-3 text-sm"><div className="flex items-center gap-2"><Badge>{selectedRecord.tag}</Badge><Badge className={STATUS_STYLES[selectedRecord.status]}>{selectedRecord.status}</Badge></div><p className="text-slate-500">{formatDate(selectedRecord.date)}</p><p className="font-medium text-slate-800">{selectedRecord.subtitle}</p><p className="text-slate-600">{selectedRecord.description}</p></div>}
      </Drawer>

      <Dialog open={taskOpen} onClose={() => { if (!savingTask) setTaskOpen(false); }} title="New Community Programs Task" description="Create a shared task without leaving this workspace." size="md" footer={<><Button variant="outline" disabled={savingTask} onClick={() => setTaskOpen(false)}>Cancel</Button><Button disabled={savingTask} onClick={() => void submitNewTask()}><Plus className="h-4 w-4" /> {savingTask ? 'Creating…' : 'Create Task'}</Button></>}>
        <div className="grid gap-4">
          <div><Label htmlFor="community-task-title" required>Task title</Label><Input id="community-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Enter task title" autoFocus /></div>
          <div><Label htmlFor="community-task-control">Control number</Label><Input id="community-task-control" value={taskControlNumber} onChange={(event) => setTaskControlNumber(event.target.value)} placeholder="Optional control number" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="community-task-assignee" required>Assign to</Label><Select id="community-task-assignee" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)}><option value="">Select employee</option>{directoryUsers.map((person) => <option key={person.username} value={person.username}>{[person.firstName, person.lastName].filter(Boolean).join(' ') || person.name}</option>)}</Select></div>
            <div><Label htmlFor="community-task-department">Department</Label><Select id="community-task-department" value={taskDepartment} onChange={(event) => setTaskDepartment(event.target.value)}><option value="">Use my department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></div>
            <div><Label>Office assignment</Label><Input value="Community Relations Office" disabled readOnly /></div>
            <div><Label htmlFor="community-task-subject">Subject</Label><Select id="community-task-subject" value={newTaskSubject} onChange={(event) => setNewTaskSubject(event.target.value)}><option value="Corporate Social Responsibility">Corporate Social Responsibility</option><option value="Community Relations">Community Relations</option></Select></div>
            <div><Label htmlFor="community-task-priority">Priority</Label><Select id="community-task-priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)}>{['Low', 'Normal', 'High', 'Urgent'].map((priority) => <option key={priority}>{priority}</option>)}</Select></div>
            <div><Label htmlFor="community-task-due">Due date</Label><Input id="community-task-due" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></div>
          </div>
          <div><Label htmlFor="community-task-description">Instructions / notes</Label><Textarea id="community-task-description" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Add instructions, expected output, links, or context." /></div>
        </div>
      </Dialog>
    </div>
  );
}
