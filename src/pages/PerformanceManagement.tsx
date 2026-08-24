import { useEffect, useMemo, useState } from 'react';
import { Building2, BriefcaseBusiness, ChevronDown, ChevronRight, FileSpreadsheet, FileText, Network, Paperclip, Pencil, Plus, Printer, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import {
  createPerformanceAccomplishment, createPerformanceAssignment, createPerformancePlan, createPerformanceTarget, downloadPerformanceEvidence, fetchEmployeeSkillChecks, fetchOrgStructure, fetchPerformanceAssignments, fetchPerformancePlans, fetchPositionDrPl, fetchUserDirectory, removePerformanceEmployee, updateEmployeeSkillCheck, updatePerformancePlan, updatePerformanceTarget, updatePositionDrPl, uploadPerformanceEvidence,
  type DirectoryUser, type EmployeeSkillCheck, type OrgDepartment, type OrgOffice, type OrgPosition, type PerformanceAssignment, type PerformancePlan, type PerformanceTarget, type PositionDrPl, type PositionDuty,
} from '@/lib/api';
import type { WorkspaceModuleDef } from '@/lib/workspace';

const POSITION_CLASS_LABELS: Record<string, string> = {
  DEPARTMENT_MANAGER: 'Department Manager',
  DEPARTMENT_SECRETARY: 'Department Secretary',
  OFFICE_SECRETARY: 'Office Secretary',
  SUPERVISOR: 'Supervisor',
  RAF: 'Rank-and-File',
};

type AppraisalFactor = {
  title: string;
  description?: string;
  weight: number;
  ratings: [string, string, string, string, string];
  allowsTargets?: boolean;
};

const WORK_OUTPUT_FACTORS: AppraisalFactor[] = [
  { title: '1. Accomplishment of Work', description: 'Employee’s overall performance in achieving his/her targets', weight: 20, allowsTargets: true, ratings: ['Exceptional level of achievement (100% accomplishment of work or even exceeded target)', 'More than adequate level of achievement (96% to 99% accomplishment of work)', 'Level of achievement is less than adequate (91% to 95% accomplishment of work)', 'Level of achievement is less than adequate (86% to 90% accomplishment of work)', 'Poor level of accomplishment (85% and below accomplishment of work)'] },
  { title: '2. Quality of Work', description: 'The value, thoroughness, accuracy, neatness, and acceptability of completed work', weight: 20, ratings: ['Excellent results; all aspects of the work assignment are thoroughly covered', 'One or two minor errors in execution; results are still very good', 'More than two minor errors in execution; results are acceptable', 'One major error that can be overcome through supervisor assistance', 'Haphazard or careless execution; results are unacceptable'] },
  { title: '3. Timeliness', weight: 20, ratings: ['100% of tasks accomplished before the set deadline', '100% of tasks accomplished on the set deadline', '90% of tasks completed on the set deadline', '75% of tasks completed on the set deadline', 'Task not yet begun at the expected date of completion'] },
  { title: '4. Job Knowledge and Skills', description: 'Degree of theoretical knowledge, skills, and practical know-how of the present job', weight: 10, ratings: ['Exhibits excellent job knowledge and skills', 'Exhibits thorough job knowledge and skills', 'Exhibits enough job knowledge and skills', 'Exhibits poor job knowledge and skills', 'Lacks job knowledge and skills'] },
];

const BEHAVIORAL_FACTORS: AppraisalFactor[] = [
  { title: '1. Integrity', weight: 10, ratings: ['Consistently honest, upright, and scrupulous; strictly adheres to BENECO rules and standards', 'Maintains a high level of propriety in conduct considering BENECO norms', 'Usually conscientious and steadfast in upholding values and principles', 'Insincere or not trustworthy in carrying out duties and responsibilities', 'Dishonest in transactions and dealings with others'] },
  { title: '2. Customer Focus / Commitment', description: 'Willingness to provide excellent service to internal and external customers', weight: 6, ratings: ['Enthusiastically serves customers and consistently demonstrates courtesy and respect', 'Often willing to meet customer needs and is usually courteous and polite', 'Occasionally willing to serve and demonstrates courtesy and respect', 'Seldom demonstrates courtesy, respect, or willingness to assist', 'Shows lack of interest and an inconsiderate attitude toward customers'] },
  { title: '3. Teamwork and Cooperation', description: 'Capacity to work with the group toward a common goal', weight: 5, ratings: ['Highly cooperative; actively assists coworkers and maintains a positive environment', 'Responsive, willingly cooperative, proactive, and respectful of differences', 'Good-natured team player who readily offers assistance and adapts', 'Contributes but prefers working alone and is at times uncooperative', 'Counteracts the team, causes difficulty, and is unwilling to help'] },
  { title: '4. Initiative and Resourcefulness', description: 'Promptness in taking and completing tasks with minimal supervision', weight: 5, ratings: ['Offers good suggestions, exceeds requirements, and supports cost-saving initiatives', 'Suggests effective approaches and identifies opportunities for improvement', 'Occasionally shows initiative and performs regular work without direction', 'Seldom shows initiative', 'Shows little interest and repeatedly needs to be told what to do'] },
  { title: '5. Punctuality', description: 'Observes prescribed working hours', weight: 2, ratings: ['1 to 5 times tardy', '6 to 10 times tardy', '11 to 15 times tardy', '16 to 20 times tardy', 'More than 21 times tardy'] },
  { title: '6. Attendance', description: 'Reports to work regularly, excluding allowable leaves', weight: 2, ratings: ['No leaves without pay', '1 to 3 absences (leave without pay)', '4 to 6 absences (leave without pay)', '7 to 10 absences (leave without pay)', 'More than 11 absences (leave without pay)'] },
];

function escapeReportText(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function AppraisalRubric({ title, subtitle, factors }: { title: string; subtitle: string; factors: AppraisalFactor[] }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1050px] table-fixed text-left text-xs">
      <thead className="bg-slate-50 uppercase tracking-wide text-slate-500"><tr><th className="w-48 border-r border-slate-200 px-3 py-2.5">Performance Factor</th>{[5, 4, 3, 2, 1].map((rating) => <th key={rating} className="border-r border-slate-200 px-3 py-2.5 text-center">{rating}</th>)}<th className="w-20 border-r border-slate-200 px-2 py-2.5 text-center">Weight</th><th className="w-20 border-r border-slate-200 px-2 py-2.5 text-center">Rating</th><th className="w-24 px-2 py-2.5 text-center">Score<br /><span className="normal-case tracking-normal">(weight × rating)</span></th></tr></thead>
      <tbody className="divide-y divide-slate-200">{factors.map((factor) => <tr key={factor.title} className="align-top text-slate-700">
        <td className="border-r border-slate-200 px-3 py-3"><div><p className="font-semibold text-slate-900">{factor.title}</p>{factor.description && <p className="mt-2 italic text-slate-500">{factor.description}</p>}</div></td>
        {factor.ratings.map((description, index) => <td key={index} className="border-r border-slate-200 px-3 py-3 text-center">{description}</td>)}
        <td className="border-r border-slate-200 px-2 py-3 text-center font-semibold">{factor.weight}%</td><td className="border-r border-slate-200 px-2 py-3 text-center text-slate-400">—</td><td className="px-2 py-3 text-center text-slate-400">—</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function assignedEmployees(employees: DirectoryUser[], assignments: PerformanceAssignment[], position: OrgPosition, automaticallyMatches: (employee: DirectoryUser) => boolean) {
  const positionAssignments = assignments.filter((assignment) => assignment.positionId === position.id);
  const manuallyIncluded = new Set(positionAssignments.filter((assignment) => assignment.mode === 'INCLUDE').map((assignment) => assignment.employeeUserId));
  const excluded = new Set(positionAssignments.filter((assignment) => assignment.mode === 'EXCLUDE').map((assignment) => assignment.employeeUserId));
  return employees.filter((employee) => !excluded.has(employee.id) && (automaticallyMatches(employee) || manuallyIncluded.has(employee.id)));
}

function PositionRow({ position, employees, assignments, plans, hasDrPl, onSelectEmployee, onRequestAssignment, onOpenDrPl }: { position: OrgPosition; employees: DirectoryUser[]; assignments: PerformanceAssignment[]; plans: PerformancePlan[]; hasDrPl: boolean; onSelectEmployee: (employee: DirectoryUser, position: OrgPosition) => void; onRequestAssignment: (position: OrgPosition) => void; onOpenDrPl: (position: OrgPosition) => void }) {
  const [open, setOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); };
  }, [contextMenu]);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-surface" onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }); }}>
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><BriefcaseBusiness className="h-3.5 w-3.5" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-700">{position.title}</span><span className="block text-[11px] text-slate-400">{employees.length} {employees.length === 1 ? 'employee' : 'employees'}</span></span>
        </button>
        <button type="button" onClick={() => onOpenDrPl(position)} className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition ${hasDrPl ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100' : 'border-slate-200 bg-surface text-slate-500 hover:bg-slate-100'}`} title="Duties and Responsibilities / Position Level"><FileText className="h-3.5 w-3.5" /> DR / PL</button>
        <Badge className="shrink-0 border-slate-200 bg-slate-50 text-slate-600">{POSITION_CLASS_LABELS[position.employeeClass] ?? position.employeeClass}</Badge>
      </div>
      {open && (
        <div className="space-y-1 border-t border-slate-100 bg-slate-50/50 px-3 py-2">
          {employees.map((employee) => {
            const employeePlans = plans.filter((plan) => plan.employeeUserId === employee.id);
            const manualAssignment = assignments.find((assignment) => assignment.positionId === position.id && assignment.employeeUserId === employee.id && assignment.mode === 'INCLUDE');
            return <button key={employee.id} type="button" onClick={() => onSelectEmployee(employee, position)} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-surface">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700"><UserRound className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{employee.name}</span><span className="block text-[11px] text-slate-500">{employee.employeeNo}{manualAssignment ? ` · Detail order${manualAssignment.detailOrder ? `: ${manualAssignment.detailOrder}` : ''}` : ''}</span></span>
              <Badge>{employeePlans.length} {employeePlans.length === 1 ? 'plan' : 'plans'}</Badge>
            </button>;
          })}
          {employees.length === 0 && <p className="px-10 py-1.5 text-xs text-slate-400">No employee assigned to this position</p>}
        </div>
      )}
      {contextMenu && <div className="fixed z-[70] min-w-44 rounded-lg border border-slate-200 bg-surface p-1 shadow-xl" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => { setContextMenu(null); onRequestAssignment(position); }}><Plus className="h-4 w-4 text-brand-600" /> Assign employee</button>
      </div>}
    </div>
  );
}

function OfficeBranch({ office, offices, departmentCode, employees, assignments, plans, profiles, onSelectEmployee, onRequestAssignment, onOpenDrPl, depth = 0 }: { office: OrgOffice; offices: OrgOffice[]; departmentCode: string; employees: DirectoryUser[]; assignments: PerformanceAssignment[]; plans: PerformancePlan[]; profiles: PositionDrPl[]; onSelectEmployee: (employee: DirectoryUser, position: OrgPosition) => void; onRequestAssignment: (position: OrgPosition) => void; onOpenDrPl: (position: OrgPosition) => void; depth?: number }) {
  const [open, setOpen] = useState(true);
  const children = offices.filter((item) => item.parentOfficeId === office.id);
  const itemCount = office.positions.length + children.length;
  const orderedPositions = [...office.positions].sort((left, right) => {
    const roleOrder = (position: OrgPosition) => position.employeeClass === 'SUPERVISOR' ? 0 : 1;
    return roleOrder(left) - roleOrder(right) || left.title.localeCompare(right.title);
  });

  return (
    <div className={depth > 0 ? 'ml-5 border-l border-slate-200 pl-4' : ''}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-slate-50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        <Network className="h-4 w-4 shrink-0 text-brand-600" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{office.name}</span>
        <span className="text-xs text-slate-400">{office.positions.length} {office.positions.length === 1 ? 'position' : 'positions'}</span>
      </button>
      {open && (
        <div className="mb-2 ml-8 space-y-2">
          {orderedPositions.map((position) => <PositionRow key={position.id} position={position} employees={assignedEmployees(employees, assignments, position, (employee) => employee.departmentCode === departmentCode && employee.unitName === office.name && employee.position === position.title)} assignments={assignments} plans={plans} hasDrPl={profiles.some((profile) => profile.positionId === position.id)} onSelectEmployee={onSelectEmployee} onRequestAssignment={onRequestAssignment} onOpenDrPl={onOpenDrPl} />)}
          {children.map((child) => <OfficeBranch key={child.id} office={child} offices={offices} departmentCode={departmentCode} employees={employees} assignments={assignments} plans={plans} profiles={profiles} onSelectEmployee={onSelectEmployee} onRequestAssignment={onRequestAssignment} onOpenDrPl={onOpenDrPl} depth={depth + 1} />)}
          {itemCount === 0 && <p className="px-3 py-2 text-xs text-slate-400">No positions assigned</p>}
        </div>
      )}
    </div>
  );
}

export default function PerformanceManagement({ module }: { module: WorkspaceModuleDef }) {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const roleNames = new Set([user?.role, ...(user?.roles ?? [])].filter(Boolean).map((role) => String(role).toLowerCase()));
  const isPerformanceAdmin = roleNames.has('administrator');
  const isDepartmentManager = roleNames.has('department manager');
  const isOfficeSupervisor = roleNames.has('supervisor');
  const canManagePerformance = isPerformanceAdmin || isDepartmentManager || isOfficeSupervisor;
  const [pageTab, setPageTab] = useState(canManagePerformance ? 'management' : 'my-performance');
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [employees, setEmployees] = useState<DirectoryUser[]>([]);
  const [assignments, setAssignments] = useState<PerformanceAssignment[]>([]);
  const [plans, setPlans] = useState<PerformancePlan[]>([]);
  const [profiles, setProfiles] = useState<PositionDrPl[]>([]);
  const [skillChecks, setSkillChecks] = useState<EmployeeSkillCheck[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<DirectoryUser | null>(null);
  const [selectedEmployeePosition, setSelectedEmployeePosition] = useState<OrgPosition | null>(null);
  const [employeeTab, setEmployeeTab] = useState('skillset');
  const [removeEmployeeOpen, setRemoveEmployeeOpen] = useState(false);
  const [editAssignmentOpen, setEditAssignmentOpen] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PerformancePlan | null>(null);
  const [openTargetAfterPlan, setOpenTargetAfterPlan] = useState(false);
  const [targetPlan, setTargetPlan] = useState<PerformancePlan | null>(null);
  const [editingTarget, setEditingTarget] = useState<PerformanceTarget | null>(null);
  const [accomplishmentTarget, setAccomplishmentTarget] = useState<{ plan: PerformancePlan; target: PerformanceTarget } | null>(null);
  const [assignmentPosition, setAssignmentPosition] = useState<OrgPosition | null>(null);
  const [drPlPosition, setDrPlPosition] = useState<OrgPosition | null>(null);
  const [positionDetailsOpen, setPositionDetailsOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [dutyCategory, setDutyCategory] = useState<string | null>(null);
  const [editingDutyId, setEditingDutyId] = useState<string | null>(null);
  const [deleteCategoryOpen, setDeleteCategoryOpen] = useState(false);
  const [deleteDutyOpen, setDeleteDutyOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ employeeUserId: '', currentLevel: '', detailOrder: '', effectiveStart: '', effectiveEnd: '' });
  const [editAssignmentForm, setEditAssignmentForm] = useState({ currentLevel: '', detailOrder: '', effectiveStart: '', effectiveEnd: '' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [positionDetailsForm, setPositionDetailsForm] = useState<{ employmentLevel: string; reportsTo: string; areaOfWork: string; purpose: string; maxLevel: string; competencyNotes: { level: number; name: string; description: string }[] }>({ employmentLevel: '', reportsTo: '', areaOfWork: '', purpose: '', maxLevel: '4', competencyNotes: [] });
  const [dutyForm, setDutyForm] = useState({ description: '', competency: '' });
  const [planForm, setPlanForm] = useState({ cycleLabel: 'January–June 2026', periodStart: '2026-01-01', periodEnd: '2026-06-30', status: 'DRAFT' });
  const [targetForm, setTargetForm] = useState<{ description: string; measureType: PerformanceTarget['measureType']; targetValue: string; unit: string; weight: string; dueDate: string }>({ description: '', measureType: 'COUNT', targetValue: '', unit: '', weight: '', dueDate: '' });
  const [accomplishmentForm, setAccomplishmentForm] = useState({ description: '', quantity: '', accomplishedOn: '' });
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  async function loadStructure() {
    if (!token) return;
    setLoading(true);
    try {
      const [nextDepartments, nextEmployees, nextPlans, nextAssignments, nextProfiles, nextSkillChecks] = await Promise.all([fetchOrgStructure(token), fetchUserDirectory(token), fetchPerformancePlans(token), fetchPerformanceAssignments(token), fetchPositionDrPl(token), fetchEmployeeSkillChecks(token)]);
      setDepartments(nextDepartments);
      setEmployees(nextEmployees);
      setPlans(nextPlans);
      setAssignments(nextAssignments);
      setProfiles(nextProfiles);
      setSkillChecks(nextSkillChecks);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to load organizational structure', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadStructure(); }, [token]);
  useEffect(() => { if (!canManagePerformance) setPageTab('my-performance'); }, [canManagePerformance]);

  function toggleDepartment(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function savePlan() {
    if (!token || !selectedEmployee) return;
    setSaving(true);
    try {
      if (editingPlan) {
        const updated = await updatePerformancePlan(token, editingPlan.id, planForm);
        setPlans((current) => current.map((plan) => plan.id === editingPlan.id ? { ...updated.plan, targets: plan.targets } : plan));
        setPlanDialogOpen(false);
        setEditingPlan(null);
        toast({ kind: 'success', title: 'Performance plan updated', description: `${planForm.cycleLabel} was saved.` });
        return;
      }
      const created = await createPerformancePlan(token, { employeeUserId: selectedEmployee.id, cycleLabel: planForm.cycleLabel, periodStart: planForm.periodStart, periodEnd: planForm.periodEnd });
      setPlans((current) => [created.plan, ...current]);
      setPlanDialogOpen(false);
      if (openTargetAfterPlan) {
        setOpenTargetAfterPlan(false);
        setTargetForm((form) => ({ ...form, measureType: 'COUNT' }));
        setTargetPlan(created.plan);
      }
      toast({ kind: 'success', title: 'Performance plan created', description: `${planForm.cycleLabel} is ready for individual work targets.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to create performance plan', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  function editPerformancePlan(plan: PerformancePlan) {
    setEditingPlan(plan);
    setOpenTargetAfterPlan(false);
    setPlanForm({ cycleLabel: plan.cycleLabel, periodStart: plan.periodStart, periodEnd: plan.periodEnd, status: plan.status });
    setPlanDialogOpen(true);
  }

  function addAccomplishmentTarget() {
    if (!selectedEmployee) return;
    const employeePlan = plans.find((plan) => plan.employeeUserId === selectedEmployee.id);
    setTargetForm({ description: '', measureType: 'COUNT', targetValue: '', unit: '', weight: '', dueDate: '' });
    setEditingTarget(null);
    if (employeePlan) {
      setTargetPlan(employeePlan);
      return;
    }
    setOpenTargetAfterPlan(true);
    setPlanDialogOpen(true);
  }

  function editWorkTarget(plan: PerformancePlan, target: PerformanceTarget) {
    setEditingTarget(target);
    setTargetForm({ description: target.description, measureType: target.measureType, targetValue: String(target.targetValue), unit: target.unit, weight: String(target.weight), dueDate: target.dueDate ?? '' });
    setTargetPlan(plan);
  }

  async function saveTarget() {
    if (!token || !targetPlan) return;
    setSaving(true);
    try {
      const input = {
        description: targetForm.description, measureType: targetForm.measureType, targetValue: Number(targetForm.targetValue),
        unit: targetForm.unit, weight: Number(targetForm.weight), dueDate: targetForm.dueDate || undefined,
      };
      const saved = editingTarget ? await updatePerformanceTarget(token, targetPlan.id, editingTarget.id, input) : await createPerformanceTarget(token, targetPlan.id, input);
      setPlans((current) => current.map((plan) => plan.id === targetPlan.id ? { ...plan, targets: editingTarget ? plan.targets.map((target) => target.id === editingTarget.id ? saved.target : target) : [...plan.targets, saved.target] } : plan));
      setTargetPlan(null);
      setEditingTarget(null);
      setTargetForm({ description: '', measureType: 'COUNT', targetValue: '', unit: '', weight: '', dueDate: '' });
      toast({ kind: 'success', title: editingTarget ? 'Work target updated' : 'Work target added', description: editingTarget ? 'The target changes were saved.' : 'The target is now part of the employee performance plan.' });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add target', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function saveAccomplishment() {
    if (!token || !accomplishmentTarget) return;
    setSaving(true);
    try {
      const created = await createPerformanceAccomplishment(token, accomplishmentTarget.target.id, { description: accomplishmentForm.description, quantity: Number(accomplishmentForm.quantity), accomplishedOn: accomplishmentForm.accomplishedOn || undefined });
      for (const file of evidenceFiles) await uploadPerformanceEvidence(token, created.accomplishment.id, file);
      const nextPlans = await fetchPerformancePlans(token);
      setPlans(nextPlans);
      setAccomplishmentTarget(null);
      setAccomplishmentForm({ description: '', quantity: '', accomplishedOn: '' });
      setEvidenceFiles([]);
      toast({ kind: 'success', title: 'Accomplishment recorded', description: `${accomplishmentForm.quantity} ${accomplishmentTarget.target.unit} added${evidenceFiles.length ? ` with ${evidenceFiles.length} evidence file${evidenceFiles.length === 1 ? '' : 's'}` : ''}.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to record accomplishment', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function saveAssignment() {
    if (!token || !assignmentPosition) return;
    setSaving(true);
    try {
      const created = await createPerformanceAssignment(token, { positionId: assignmentPosition.id, ...assignmentForm });
      setAssignments((current) => [...current.filter((assignment) => !(assignment.positionId === created.assignment.positionId && assignment.employeeUserId === created.assignment.employeeUserId)), created.assignment]);
      setAssignmentPosition(null);
      setAssignmentForm({ employeeUserId: '', currentLevel: '', detailOrder: '', effectiveStart: '', effectiveEnd: '' });
      toast({ kind: 'success', title: 'Employee assigned', description: `The performance assignment was added to ${assignmentPosition.title}.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to assign employee', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  function openEmployee(employee: DirectoryUser, position: OrgPosition) {
    setSelectedEmployee(employee);
    setSelectedEmployeePosition(position);
    setEmployeeTab('skillset');
  }

  function openDrPl(position: OrgPosition) {
    setDrPlPosition(position);
  }

  function openPositionDetails() {
    if (!drPlPosition) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    if (!profile) return;
    setPositionDetailsForm({ employmentLevel: profile.employmentLevel, reportsTo: profile.reportsTo, areaOfWork: profile.areaOfWork, purpose: profile.purpose, maxLevel: String(profile.maxLevel), competencyNotes: Array.from({ length: Math.max(0, profile.maxLevel - 1) }, (_, index) => { const level = index + 2; return profile.competencyNotes.find((note) => note.level === level) ?? { level, name: `Level ${level}`, description: '' }; }) });
    setPositionDetailsOpen(true);
  }

  function setPositionMaxLevel(value: string) {
    setPositionDetailsForm((form) => {
      const maxLevel = Number(value);
      const competencyNotes = Number.isInteger(maxLevel) && maxLevel >= 2 && maxLevel <= 20
        ? Array.from({ length: maxLevel - 1 }, (_, index) => { const level = index + 2; return form.competencyNotes.find((note) => note.level === level) ?? { level, name: `Level ${level}`, description: '' }; })
        : form.competencyNotes;
      return { ...form, maxLevel: value, competencyNotes };
    });
  }

  function closeEmployee() {
    setSelectedEmployee(null);
    setSelectedEmployeePosition(null);
    setRemoveEmployeeOpen(false);
    setEditAssignmentOpen(false);
  }

  function openEditAssignment() {
    if (!selectedEmployee || !selectedEmployeePosition) return;
    const assignment = assignments.find((item) => item.positionId === selectedEmployeePosition.id && item.employeeUserId === selectedEmployee.id && item.mode === 'INCLUDE');
    setEditAssignmentForm({
      currentLevel: assignment?.currentLevel ? String(assignment.currentLevel) : '',
      detailOrder: assignment?.detailOrder ?? '',
      effectiveStart: assignment?.effectiveStart ?? '',
      effectiveEnd: assignment?.effectiveEnd ?? '',
    });
    setEditAssignmentOpen(true);
  }

  async function saveEditedAssignment() {
    if (!token || !selectedEmployee || !selectedEmployeePosition || !editAssignmentForm.currentLevel) return;
    setSaving(true);
    try {
      const saved = await createPerformanceAssignment(token, { positionId: selectedEmployeePosition.id, employeeUserId: selectedEmployee.id, ...editAssignmentForm });
      setAssignments((current) => [...current.filter((assignment) => !(assignment.positionId === saved.assignment.positionId && assignment.employeeUserId === saved.assignment.employeeUserId)), saved.assignment]);
      setEditAssignmentOpen(false);
      toast({ kind: 'success', title: 'Assignment details updated', description: `${selectedEmployee.name}'s Performance Management details were saved.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update assignment', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function removeEmployeeFromPosition() {
    if (!token || !selectedEmployee || !selectedEmployeePosition) return;
    setSaving(true);
    try {
      const removed = await removePerformanceEmployee(token, selectedEmployeePosition.id, selectedEmployee.id);
      setAssignments((current) => [...current.filter((assignment) => !(assignment.positionId === removed.assignment.positionId && assignment.employeeUserId === removed.assignment.employeeUserId)), removed.assignment]);
      toast({ kind: 'success', title: 'Employee removed from position', description: 'The employee account and official Administration assignment were not changed.' });
      closeEmployee();
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to remove employee', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function setSkillLevel(dutyId: string, level: number, checked: boolean) {
    if (!token || !selectedEmployee || !selectedEmployeePosition) return;
    try {
      const currentCheck = skillChecks.find((check) => check.employeeUserId === selectedEmployee.id && check.positionId === selectedEmployeePosition.id && check.dutyId === dutyId);
      const levels = new Set(currentCheck?.levels ?? [2, 3, 4].filter((item) => currentCheck?.[`level${item}` as 'level2' | 'level3' | 'level4']));
      if (checked) levels.add(level); else levels.delete(level);
      const result = await updateEmployeeSkillCheck(token, { employeeUserId: selectedEmployee.id, positionId: selectedEmployeePosition.id, dutyId, levels: [...levels] });
      setSkillChecks((current) => [...current.filter((check) => !(check.employeeUserId === result.check.employeeUserId && check.positionId === result.check.positionId && check.dutyId === result.check.dutyId)), result.check]);
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to update skillset', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  }

  async function saveDrPlChanges(profile: PositionDrPl, categories: string[], duties: PositionDuty[], maxLevel = profile.maxLevel) {
    if (!token) return;
    const saved = await updatePositionDrPl(token, profile.positionId, { purpose: profile.purpose, employmentLevel: profile.employmentLevel, reportsTo: profile.reportsTo, areaOfWork: profile.areaOfWork, maxLevel, competencyNotes: profile.competencyNotes, categories, duties });
    setProfiles((current) => current.map((item) => item.positionId === saved.profile.positionId ? saved.profile : item));
  }

  async function savePositionDetails() {
    if (!token || !drPlPosition) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    const maxLevel = Number(positionDetailsForm.maxLevel);
    if (!profile || !Number.isInteger(maxLevel) || maxLevel < 2 || maxLevel > 20) return;
    setSaving(true);
    try {
      const saved = await updatePositionDrPl(token, profile.positionId, {
        employmentLevel: positionDetailsForm.employmentLevel.trim(), reportsTo: positionDetailsForm.reportsTo.trim(), areaOfWork: positionDetailsForm.areaOfWork.trim(),
        purpose: positionDetailsForm.purpose.trim(), maxLevel, competencyNotes: positionDetailsForm.competencyNotes.filter((note) => note.level <= maxLevel), categories: profile.categories ?? [], duties: profile.duties,
      });
      setProfiles((current) => current.map((item) => item.positionId === saved.profile.positionId ? saved.profile : item));
      setPositionDetailsOpen(false);
      toast({ kind: 'success', title: 'Position details updated', description: 'The DR / PL profile details were saved.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to update position details', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }

  async function saveCategory() {
    if (!drPlPosition || !categoryForm.name.trim()) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    if (!profile) return;
    const existingCategories = profile.categories ?? profile.duties.map((duty) => duty.kra);
    const categories = editingCategory
      ? existingCategories.map((name) => name === editingCategory ? categoryForm.name.trim() : name)
      : [...new Set([...existingCategories, categoryForm.name.trim()])];
    const duties = editingCategory ? profile.duties.map((duty) => duty.kra === editingCategory ? { ...duty, kra: categoryForm.name.trim() } : duty) : profile.duties;
    setSaving(true);
    try {
      await saveDrPlChanges(profile, categories, duties);
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '' });
      toast({ kind: 'success', title: editingCategory ? 'Category updated' : 'Category added', description: `${categoryForm.name.trim()} is ready for duties.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add category', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  function openCategoryEditor(category?: string) {
    setEditingCategory(category ?? null);
    setCategoryForm({ name: category ?? '' });
    setCategoryDialogOpen(true);
  }

  function openDutyEditor(category: string, duty?: PositionDuty) {
    setDutyCategory(category);
    setEditingDutyId(duty?.id ?? null);
    setDutyForm({ description: duty?.description ?? '', competency: duty?.competency ?? '' });
  }

  async function saveDuty() {
    if (!drPlPosition || !dutyCategory || !dutyForm.description.trim() || !dutyForm.competency.trim()) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    if (!profile) return;
    const duty: PositionDuty = {
      id: `${profile.positionId}-${Date.now()}`, kra: dutyCategory, kraWeight: profile.duties.find((item) => item.kra === dutyCategory)?.kraWeight ?? 0,
      description: dutyForm.description.trim(), applicableLevels: profile.positionLevels, competency: dutyForm.competency.trim(),
      levelRequirement: '',
    };
    setSaving(true);
    try {
      const duties = editingDutyId ? profile.duties.map((item) => item.id === editingDutyId ? { ...item, description: duty.description, competency: duty.competency } : item) : [...profile.duties, duty];
      await saveDrPlChanges(profile, profile.categories ?? [...new Set(profile.duties.map((item) => item.kra))], duties);
      setDutyCategory(null);
      setEditingDutyId(null);
      setDutyForm({ description: '', competency: '' });
      toast({ kind: 'success', title: editingDutyId ? 'Duty updated' : 'Duty added', description: `The duty was saved under ${dutyCategory}.` });
    } catch (error) {
      toast({ kind: 'error', title: 'Unable to add duty', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setSaving(false); }
  }

  async function deleteCategory() {
    if (!drPlPosition || !editingCategory) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    if (!profile) return;
    setSaving(true);
    try {
      await saveDrPlChanges(profile, (profile.categories ?? []).filter((name) => name !== editingCategory), profile.duties.filter((duty) => duty.kra !== editingCategory));
      setDeleteCategoryOpen(false); setCategoryDialogOpen(false); setEditingCategory(null);
      toast({ kind: 'success', title: 'Category deleted', description: 'The category and its duties were removed.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to delete category', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }

  async function deleteDuty() {
    if (!drPlPosition || !editingDutyId) return;
    const profile = profiles.find((item) => item.positionId === drPlPosition.id);
    if (!profile) return;
    setSaving(true);
    try {
      await saveDrPlChanges(profile, profile.categories ?? [], profile.duties.filter((duty) => duty.id !== editingDutyId));
      setDeleteDutyOpen(false); setDutyCategory(null); setEditingDutyId(null);
      toast({ kind: 'success', title: 'Duty deleted', description: 'The duty was removed from the position.' });
    } catch (error) { toast({ kind: 'error', title: 'Unable to delete duty', description: error instanceof Error ? error.message : 'Please try again.' }); }
    finally { setSaving(false); }
  }

  const selectedPerformanceAssignment = selectedEmployee && selectedEmployeePosition
    ? assignments.find((assignment) => assignment.positionId === selectedEmployeePosition.id && assignment.employeeUserId === selectedEmployee.id && assignment.mode === 'INCLUDE')
    : undefined;
  const isEmployeeView = !canManagePerformance;
  const visibleDepartments = useMemo(() => {
    if (isPerformanceAdmin) return departments;
    const departmentRows = departments.filter((department) => department.code === user?.departmentCode);
    if (!isOfficeSupervisor) return departmentRows;
    return departmentRows.map((department) => {
      const scopeIds = new Set(department.offices.filter((office) => office.name === user?.unitName).map((office) => office.id));
      let changed = true;
      while (changed) { changed = false; department.offices.forEach((office) => { if (office.parentOfficeId && scopeIds.has(office.parentOfficeId) && !scopeIds.has(office.id)) { scopeIds.add(office.id); changed = true; } }); }
      return { ...department, positions: [], offices: department.offices.filter((office) => scopeIds.has(office.id)) };
    });
  }, [departments, isOfficeSupervisor, isPerformanceAdmin, user?.departmentCode, user?.unitName]);
  const selfEmployee = employees.find((employee) => employee.id === user?.id);
  const selfAssignment = assignments.find((assignment) => assignment.employeeUserId === user?.id && assignment.mode === 'INCLUDE');
  const allPositions = departments.flatMap((department) => [...department.positions, ...department.offices.flatMap((office) => office.positions)]);
  const selfPosition = allPositions.find((position) => position.id === selfAssignment?.positionId) ?? allPositions.find((position) => position.title === user?.position);

  function employeeReportTable() {
    if (!selectedEmployee || !selectedEmployeePosition) return '';
    const profile = profiles.find((item) => item.positionId === selectedEmployeePosition.id);
    const employeePlans = plans.filter((plan) => plan.employeeUserId === selectedEmployee.id);
    if (employeeTab === 'skillset') {
      const rows = (profile?.duties ?? []).map((duty) => {
        const check = skillChecks.find((item) => item.employeeUserId === selectedEmployee.id && item.positionId === selectedEmployeePosition.id && item.dutyId === duty.id);
        const levels = check?.levels ?? [2, 3, 4].filter((level) => check?.[`level${level}` as 'level2' | 'level3' | 'level4']);
        return `<tr><td>${escapeReportText(duty.kra)}</td><td>${escapeReportText(duty.description)}</td><td>${escapeReportText(duty.competency)}</td><td>${escapeReportText(levels.join(', ') || '—')}</td></tr>`;
      }).join('');
      return `<h2>Skillset</h2><table><thead><tr><th>Category</th><th>Duty / Responsibility</th><th>Competencies Needed</th><th>Attained Levels</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No skillset requirements available.</td></tr>'}</tbody></table>`;
    }
    return `<h2>Performance Plans</h2>${employeePlans.map((plan) => `<section><h3>${escapeReportText(plan.cycleLabel)} <small>${escapeReportText(plan.status)}</small></h3><p>${escapeReportText(plan.periodStart)} to ${escapeReportText(plan.periodEnd)}</p><table><thead><tr><th>Target</th><th>Measurement</th><th>Target Value</th><th>Weight</th><th>Due Date</th><th>Accomplishments</th><th>Evidence</th></tr></thead><tbody>${plan.targets.map((target) => { const items = target.accomplishments ?? []; return `<tr><td>${escapeReportText(target.description)}</td><td>${escapeReportText(target.measureType)}</td><td>${escapeReportText(`${target.targetValue} ${target.unit}`)}</td><td>${escapeReportText(`${target.weight}%`)}</td><td>${escapeReportText(target.dueDate || '—')}</td><td>${items.map((item) => `${escapeReportText(item.description)} (${escapeReportText(item.quantity)}${item.accomplishedOn ? `, ${escapeReportText(item.accomplishedOn)}` : ''})`).join('<br>') || '—'}</td><td>${items.flatMap((item) => item.evidence ?? []).map((file) => escapeReportText(file.name)).join('<br>') || '—'}</td></tr>`; }).join('') || '<tr><td colspan="7">No targets added.</td></tr>'}</tbody></table></section>`).join('') || '<p>No performance plans available.</p>'}`;
  }

  function printEmployeeReport() {
    if (!selectedEmployee || !selectedEmployeePosition) return;
    const reportWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!reportWindow) { toast({ kind: 'error', title: 'Unable to open print view', description: 'Allow pop-ups for this site, then try again.' }); return; }
    reportWindow.opener = null;
    reportWindow.document.write(`<!doctype html><html><head><title>${escapeReportText(selectedEmployee.name)} - ${escapeReportText(employeeTab)}</title><style>body{font:12px Arial,sans-serif;color:#111;padding:28px}header{border-bottom:2px solid #166534;padding-bottom:12px;margin-bottom:18px}h1{font-size:20px;margin:0}.meta{margin-top:5px;color:#555}h2{font-size:17px}h3{font-size:14px;margin:18px 0 3px}small{float:right;border:1px solid #777;border-radius:10px;padding:2px 7px}table{width:100%;border-collapse:collapse;margin:10px 0 20px}th,td{border:1px solid #555;padding:7px;text-align:left;vertical-align:top}th{background:#e8f3eb}section{break-inside:avoid}@media print{body{padding:0}}</style></head><body><header><h1>BENECO Performance Appraisal</h1><div class="meta"><strong>${escapeReportText(selectedEmployee.name)}</strong> · ${escapeReportText(selectedEmployeePosition.title)} · ${escapeReportText(selectedEmployee.employeeNo)}</div></header>${employeeReportTable()}<script>window.onload=()=>window.print()<\/script></body></html>`);
    reportWindow.document.close();
  }

  function exportEmployeeReport() {
    if (!selectedEmployee || !selectedEmployeePosition) return;
    const content = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}th,td{border:1px solid #444;padding:6px}th{background:#dfeee3}</style></head><body><h1>BENECO Performance Appraisal</h1><p>${escapeReportText(selectedEmployee.name)} | ${escapeReportText(selectedEmployeePosition.title)} | ${escapeReportText(selectedEmployee.employeeNo)}</p>${employeeReportTable()}</body></html>`;
    const blob = new Blob([content], { type: 'application/vnd.ms-excel' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${selectedEmployee.employeeNo}-${employeeTab}-performance.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <div>
      <PageHeader title={module.name} description={module.description} crumbs={[{ label: 'My Workspace', to: '/workspace' }, { label: module.name }]} />

      <Tabs tabs={[...(canManagePerformance ? [{ value: 'management', label: 'Performance Management' }] : []), { value: 'my-performance', label: 'My Performance Plan', count: plans.filter((plan) => plan.employeeUserId === user?.id).length }]} value={pageTab} onChange={setPageTab} className="mb-4" />

      {pageTab === 'management' && canManagePerformance && <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Performance Management Structure</CardTitle>
              <p className="mt-1 text-sm text-slate-500">Departments, offices, positions, employees, and individual performance plans.</p>
            </div>
            {!loading && visibleDepartments.length > 0 && !isEmployeeView && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Badge>{visibleDepartments.length} departments</Badge>
                <Badge>{visibleDepartments.reduce((sum, department) => sum + department.offices.length, 0)} offices</Badge>
                <Badge>{employees.length} employees</Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div className="py-14 text-center text-sm text-slate-500">Loading organizational structure…</div>}
          {!loading && departments.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No organizational data found</p>
              <p className="mt-1 text-sm text-slate-500">Add departments, offices, and positions in Administration.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadStructure()}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
            </div>
          )}
          {!loading && !isEmployeeView && visibleDepartments.length > 0 && (
            <div className="space-y-3">
              {visibleDepartments.map((department) => {
                const isCollapsed = collapsed.has(department.id);
                const rootOffices = department.offices.filter((office) => !office.parentOfficeId || !department.offices.some((candidate) => candidate.id === office.parentOfficeId));
                return (
                  <section key={department.id} className="overflow-hidden rounded-xl border border-slate-200">
                    <button type="button" onClick={() => toggleDepartment(department.id)} className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3.5 text-left transition hover:bg-slate-100" aria-expanded={!isCollapsed}>
                      {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Building2 className="h-4.5 w-4.5" /></span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{department.name}</span><span className="block text-xs text-slate-500">{department.code}</span></span>
                      <span className="text-xs text-slate-500">{department.offices.length} {department.offices.length === 1 ? 'office' : 'offices'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="space-y-2 px-4 py-3">
                        {department.positions.length > 0 && (
                          <div className="ml-8 space-y-2 pb-1">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department positions</p>
                            {department.positions.map((position) => <PositionRow key={position.id} position={position} employees={assignedEmployees(employees, assignments, position, (employee) => employee.departmentCode === department.code && !employee.unitName && employee.position === position.title)} assignments={assignments} plans={plans} hasDrPl={profiles.some((profile) => profile.positionId === position.id)} onSelectEmployee={openEmployee} onRequestAssignment={setAssignmentPosition} onOpenDrPl={openDrPl} />)}
                          </div>
                        )}
                        {rootOffices.map((office) => <OfficeBranch key={office.id} office={office} offices={department.offices} departmentCode={department.code} employees={employees} assignments={assignments} plans={plans} profiles={profiles} onSelectEmployee={openEmployee} onRequestAssignment={setAssignmentPosition} onOpenDrPl={openDrPl} />)}
                        {department.positions.length === 0 && department.offices.length === 0 && <p className="px-10 py-3 text-sm text-slate-400">No offices or positions assigned</p>}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>}

      {pageTab === 'my-performance' && <Card>
        <CardHeader><CardTitle>My Performance Plan</CardTitle><p className="mt-1 text-sm text-slate-500">Your assigned appraisal cycles, measurable targets, accomplishments, and supporting evidence.</p></CardHeader>
        <CardContent>
          {loading && <div className="py-14 text-center text-sm text-slate-500">Loading your performance plans…</div>}
          {!loading && (!selfEmployee || !selfPosition) && <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center"><UserRound className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No performance assignment found</p><p className="mt-1 text-sm text-slate-500">Ask your supervisor to assign your position in Performance Management.</p></div>}
          {!loading && selfEmployee && selfPosition && plans.filter((plan) => plan.employeeUserId === selfEmployee.id).length === 0 && <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No performance plan yet</p><p className="mt-1 text-sm text-slate-500">Your assigned performance plans will appear here.</p></div>}
          {!loading && selfEmployee && selfPosition && <div className="space-y-3">{plans.filter((plan) => plan.employeeUserId === selfEmployee.id).map((plan) => {
            const accomplished = plan.targets.reduce((sum, target) => sum + (target.accomplishments ?? []).reduce((targetSum, item) => targetSum + item.quantity, 0), 0);
            return <button key={plan.id} type="button" onClick={() => { openEmployee(selfEmployee, selfPosition); setEmployeeTab('performance'); }} className="flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-surface px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><FileText className="h-4.5 w-4.5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{plan.cycleLabel}</span><Badge>{plan.status}</Badge></span><span className="mt-1 block text-xs text-slate-500">{plan.periodStart} to {plan.periodEnd} · {plan.targets.length} {plan.targets.length === 1 ? 'target' : 'targets'} · {accomplished} accomplishments recorded</span></span><span className="text-xs font-medium text-brand-700">View Plan</span><ChevronRight className="h-4 w-4 text-slate-400" /></button>;
          })}</div>}
        </CardContent>
      </Card>}

      <Dialog open={!!selectedEmployee} onClose={closeEmployee} title={selectedEmployee?.name ?? 'Employee'} description={selectedEmployee && selectedEmployeePosition ? `${selectedEmployeePosition.title} · ${selectedEmployee.employeeNo}${selectedPerformanceAssignment?.currentLevel ? ` · Current Level ${selectedPerformanceAssignment.currentLevel}` : ''}` : undefined} size="2xl" contentOverflowVisible headerActions={canManagePerformance ? <><Button variant="outline" size="icon" className="h-7 w-7" aria-label="Edit assignment details" title="Edit assignment details" onClick={openEditAssignment}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="destructive" size="icon" className="h-7 w-7" aria-label="Remove from Position" title="Remove from Position" onClick={() => setRemoveEmployeeOpen(true)}><Trash2 className="h-3.5 w-3.5" /></Button></> : undefined}>
        {selectedEmployee && selectedEmployeePosition && (() => {
          const skillProfile = profiles.find((profile) => profile.positionId === selectedEmployeePosition.id);
          const employeeChecks = skillChecks.filter((check) => check.employeeUserId === selectedEmployee.id && check.positionId === selectedEmployeePosition.id);
          const currentLevel = selectedPerformanceAssignment?.currentLevel;
          const maxLevel = skillProfile?.maxLevel ?? 4;
          const levelNumbers = Array.from({ length: Math.max(0, maxLevel - 1) }, (_, index) => index + 2);
          const targetLevel = Math.min(currentLevel ? currentLevel + 1 : 2, maxLevel);
          const attainedCount = skillProfile?.duties.filter((duty) => employeeChecks.some((check) => check.dutyId === duty.id && (check.levels ?? []).includes(targetLevel))).length ?? 0;
          const skillGroups = skillProfile ? Array.from(new Map(skillProfile.duties.map((duty) => [duty.kra, skillProfile.duties.filter((item) => item.kra === duty.kra)])).entries()) : [];
          return <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200"><Tabs tabs={[{ value: 'skillset', label: 'Skillset', count: skillProfile?.duties.length ?? 0 }, { value: 'performance', label: 'Performance', count: plans.filter((plan) => plan.employeeUserId === selectedEmployee.id).length }]} value={employeeTab} onChange={setEmployeeTab} className="min-w-0 flex-1 border-b-0 overflow-visible" /><div className="flex shrink-0 gap-2 pb-1"><Button size="sm" variant="outline" onClick={printEmployeeReport}><Printer className="h-3.5 w-3.5" /> Print</Button><Button size="sm" variant="outline" onClick={exportEmployeeReport}><FileSpreadsheet className="h-3.5 w-3.5" /> Export to Excel</Button></div></div>
            <div className="flex max-h-[calc(90vh-11rem)] min-h-0 flex-col pt-4">
            {employeeTab === 'skillset' && <div className="flex min-h-0 flex-1 flex-col gap-4">
              {canManagePerformance && <><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3"><div><p className="text-sm font-semibold text-brand-800">Vertical Promotion Skillset</p><p className="text-xs text-brand-700">Checklist derived from this position’s DR / PL requirements.</p></div><Badge>{attainedCount} of {skillProfile?.duties.length ?? 0} Level {targetLevel} attained</Badge></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Competency Level Notes</p>
                <dl className="mt-2 grid gap-2 text-xs text-slate-600">{skillProfile?.competencyNotes.map((note) => <div key={note.level} className="flex gap-2"><dt className="shrink-0 font-semibold text-slate-800">{note.level} – {note.name}</dt><dd>{note.description}</dd></div>)}</dl>
              </div></>}
              {skillProfile ? <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200"><table className={`w-full text-left text-sm ${canManagePerformance ? 'min-w-[780px]' : ''}`}><thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Duty / Responsibility</th><th className="w-72 px-4 py-3">Competencies Needed</th>{canManagePerformance && levelNumbers.map((level) => <th key={level} className="w-24 px-4 py-3 text-center">Level {level}</th>)}</tr></thead>{skillGroups.map(([kra, duties]) => <tbody key={kra} className="divide-y divide-slate-100"><tr className="bg-brand-50"><th colSpan={canManagePerformance ? 2 + levelNumbers.length : 2} className="px-4 py-3 text-sm font-semibold text-brand-800">{kra}</th></tr>{duties.map((duty) => {
                const check = employeeChecks.find((item) => item.dutyId === duty.id);
                const checkedLevels = check?.levels ?? [2, 3, 4].filter((level) => check?.[`level${level}` as 'level2' | 'level3' | 'level4']);
                return <tr key={duty.id} className={checkedLevels.includes(targetLevel) ? 'bg-brand-50/40' : 'bg-surface'}><td className="px-4 py-3"><p className="font-medium text-slate-800">{duty.description}</p></td><td className="px-4 py-3 text-xs text-slate-600">{duty.competency}</td>{canManagePerformance && levelNumbers.map((level) => { const locked = currentLevel === level; return <td key={level} className="px-4 py-3 text-center"><Checkbox checked={locked || checkedLevels.includes(level)} disabled={locked} onChange={(event) => void setSkillLevel(duty.id, level, event.target.checked)} aria-label={`${duty.description}: Level ${level}${locked ? ' (current level)' : ''}`} /></td>; })}</tr>;
              })}</tbody>)}</table></div> : <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center"><p className="text-sm font-medium text-slate-700">No DR / PL checklist available</p><p className="mt-1 text-sm text-slate-500">Encode the position’s duties and levels before assessing vertical promotion readiness.</p></div>}
            </div>}
            {employeeTab === 'performance' && <div className="space-y-4 overflow-y-auto">
              {canManagePerformance && <><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">Horizontal Step Performance</p><p className="text-xs text-slate-500">Appraisal plans and measurable targets support step progression.</p></div><Button size="sm" onClick={() => { setEditingPlan(null); setPlanForm({ cycleLabel: 'January–June 2026', periodStart: '2026-01-01', periodEnd: '2026-06-30', status: 'DRAFT' }); setOpenTargetAfterPlan(false); setPlanDialogOpen(true); }}><Plus className="h-3.5 w-3.5" /> New Plan</Button></div>
              <AppraisalRubric title="I. Work Output (70%)" subtitle="Measures results, quality, timeliness, and job knowledge using the approved appraisal standards." factors={WORK_OUTPUT_FACTORS} />
              <AppraisalRubric title="II. Behavioral Competencies (30%)" subtitle="Measures how the employee performs the job through BENECO’s behavioral standards." factors={BEHAVIORAL_FACTORS} />
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Adjectival Rating</p><div className="mt-2 flex flex-wrap gap-2"><Badge>Outstanding · 5.00</Badge><Badge>Very Satisfactory · 4.00–4.99</Badge><Badge>Satisfactory · 3.00–3.99</Badge><Badge>Unsatisfactory · 2.00–2.99</Badge><Badge>Poor · 1.00–1.99</Badge></div></div></>}
              {plans.filter((plan) => plan.employeeUserId === selectedEmployee.id).map((plan) => {
                const totalWeight = plan.targets.reduce((sum, target) => sum + target.weight, 0);
                return <section key={plan.id} className="rounded-xl border border-slate-200"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-start gap-2"><div><p className="text-sm font-semibold text-slate-900">{plan.cycleLabel}</p><p className="text-xs text-slate-500">{plan.periodStart} to {plan.periodEnd}</p></div>{canManagePerformance && <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => editPerformancePlan(plan)} aria-label={`Edit ${plan.cycleLabel}`} title="Edit performance plan"><Pencil className="h-3.5 w-3.5" /></Button>}</div><div className="flex items-center gap-2"><Badge>{plan.status}</Badge><Badge>{totalWeight}% allocated</Badge>{canManagePerformance && <Button size="sm" variant="outline" onClick={() => { setEditingTarget(null); setTargetForm({ description: '', measureType: 'COUNT', targetValue: '', unit: '', weight: '', dueDate: '' }); setTargetPlan(plan); }}><Plus className="h-3.5 w-3.5" /> Add Target</Button>}</div></div>
                  <div className="space-y-3 p-3">{plan.targets.map((target, index) => {
                    const accomplishments = target.accomplishments ?? [];
                    const accomplished = accomplishments.reduce((sum, item) => sum + item.quantity, 0);
                    const percent = target.targetValue > 0 ? (accomplished / target.targetValue) * 100 : 0;
                    return <div key={target.id} className="overflow-hidden rounded-lg border border-slate-200 bg-surface">
                      <button type="button" disabled={!canManagePerformance} onClick={() => canManagePerformance && editWorkTarget(plan, target)} className={`block w-full px-3 py-3 text-left ${canManagePerformance ? 'transition hover:bg-brand-50/30 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500' : 'cursor-default'}`} aria-label={canManagePerformance ? `Edit target ${target.description}` : `Target ${target.description}`}><div className="flex items-start gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{index + 1}</span><div className="min-w-0 flex-1"><p className="whitespace-pre-wrap text-sm font-medium text-slate-800">{target.description}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><Badge>{target.measureType}</Badge><span>Target: <strong className="text-slate-700">{target.targetValue} {target.unit}</strong></span><span>Weight: <strong className="text-slate-700">{target.weight}%</strong></span>{target.dueDate && <span>Due: <strong className="text-slate-700">{target.dueDate}</strong></span>}{canManagePerformance && <span className="ml-auto font-medium text-brand-700">Click to edit</span>}</div></div></div></button>
                      <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Accomplishments</p><p className="mt-0.5 text-xs text-slate-500">{accomplished} of {target.targetValue} {target.unit} · {percent.toFixed(1)}% accomplished · {accomplishments.length} {accomplishments.length === 1 ? 'entry' : 'entries'}</p></div><Button size="sm" variant="outline" onClick={() => { setAccomplishmentForm({ description: '', quantity: '', accomplishedOn: '' }); setEvidenceFiles([]); setAccomplishmentTarget({ plan, target }); }}><Plus className="h-3.5 w-3.5" /> Add Accomplishment</Button></div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(percent, 100)}%` }} /></div>
                        {accomplishments.length > 0 && <div className="mt-3 space-y-2">{accomplishments.map((item) => <div key={item.id} className="rounded-md border border-slate-200 bg-surface px-3 py-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm text-slate-700">{item.description}</p><p className="mt-0.5 text-xs text-slate-500">{item.quantity} {target.unit}{item.accomplishedOn ? ` · ${item.accomplishedOn}` : ''}</p></div><Badge>{item.evidence.length} evidence</Badge></div>{item.evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{item.evidence.map((file) => <button key={file.id} type="button" onClick={() => void downloadPerformanceEvidence(token!, file.id, file.name)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"><Paperclip className="h-3 w-3" /> {file.name}</button>)}</div>}</div>)}</div>}
                      </div>
                    </div>;
                  })}{plan.targets.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No work targets yet. Add the employee’s first measurable assignment.</p>}</div>
                </section>;
              })}
              {plans.every((plan) => plan.employeeUserId !== selectedEmployee.id) && <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center"><p className="text-sm font-medium text-slate-700">No performance plan yet</p><p className="mt-1 text-sm text-slate-500">Create a plan, then add the employee’s specific work targets.</p></div>}
            </div>}
            </div>
          </div>;
        })()}
      </Dialog>
      <Dialog open={editAssignmentOpen} onClose={() => setEditAssignmentOpen(false)} title="Edit Assignment Details" description={selectedEmployee && selectedEmployeePosition ? `${selectedEmployee.name} · ${selectedEmployeePosition.title}` : undefined} size="md" footer={<><Button variant="outline" onClick={() => setEditAssignmentOpen(false)}>Cancel</Button><Button onClick={() => void saveEditedAssignment()} disabled={saving || !editAssignmentForm.currentLevel}>{saving ? 'Saving…' : 'Save Changes'}</Button></>}>
        <div className="space-y-4">
          <div><Label required>Current Level</Label><Select value={editAssignmentForm.currentLevel} onChange={(event) => setEditAssignmentForm((form) => ({ ...form, currentLevel: event.target.value }))}><option value="">Select current level</option><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4">Level 4</option></Select></div>
          <div><Label>Detail Order / Assignment Reference</Label><Textarea value={editAssignmentForm.detailOrder} onChange={(event) => setEditAssignmentForm((form) => ({ ...form, detailOrder: event.target.value }))} placeholder="Enter the detail order number, temporary assignment, or reason…" /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label>Effective Start</Label><Input type="date" value={editAssignmentForm.effectiveStart} onChange={(event) => setEditAssignmentForm((form) => ({ ...form, effectiveStart: event.target.value }))} /></div><div><Label>Effective End</Label><Input type="date" value={editAssignmentForm.effectiveEnd} onChange={(event) => setEditAssignmentForm((form) => ({ ...form, effectiveEnd: event.target.value }))} /></div></div>
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800">These details apply only to Performance Management and do not modify the employee’s official Administration record.</div>
        </div>
      </Dialog>
      <ConfirmDialog open={removeEmployeeOpen} onClose={() => setRemoveEmployeeOpen(false)} onConfirm={() => void removeEmployeeFromPosition()} title="Remove Employee from Position?" description={`Remove ${selectedEmployee?.name ?? 'this employee'} from ${selectedEmployeePosition?.title ?? 'this position'} in Performance Management? Their user account and official Administration assignment will remain unchanged.`} confirmLabel={saving ? 'Removing…' : 'Remove Employee'} destructive />

      <Dialog open={planDialogOpen} onClose={() => { setPlanDialogOpen(false); setOpenTargetAfterPlan(false); setEditingPlan(null); }} title={editingPlan ? 'Edit Performance Plan' : 'Create Performance Plan'} description={`For ${selectedEmployee?.name ?? 'employee'}`} size="sm" footer={<><Button variant="outline" onClick={() => { setPlanDialogOpen(false); setOpenTargetAfterPlan(false); setEditingPlan(null); }}>Cancel</Button><Button onClick={() => void savePlan()} disabled={saving}>{saving ? 'Saving…' : editingPlan ? 'Save Changes' : openTargetAfterPlan ? 'Create & Add Target' : 'Create Plan'}</Button></>}>
        <div className="space-y-4"><div><Label required>Appraisal Cycle</Label><Input value={planForm.cycleLabel} onChange={(event) => setPlanForm((form) => ({ ...form, cycleLabel: event.target.value }))} placeholder="January–June 2026" /></div><div className="grid grid-cols-2 gap-3"><div><Label required>Period Start</Label><Input type="date" value={planForm.periodStart} onChange={(event) => setPlanForm((form) => ({ ...form, periodStart: event.target.value }))} /></div><div><Label required>Period End</Label><Input type="date" value={planForm.periodEnd} onChange={(event) => setPlanForm((form) => ({ ...form, periodEnd: event.target.value }))} /></div></div>{editingPlan && <div><Label required>Status</Label><Select value={planForm.status} onChange={(event) => setPlanForm((form) => ({ ...form, status: event.target.value }))}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="REVIEWED">Reviewed</option></Select></div>}</div>
      </Dialog>

      <Dialog open={!!targetPlan} onClose={() => { setTargetPlan(null); setEditingTarget(null); }} title={editingTarget ? 'Edit Work Target' : 'Add Work Target'} description={targetPlan?.cycleLabel} size="md" footer={<><Button variant="outline" onClick={() => { setTargetPlan(null); setEditingTarget(null); }}>Cancel</Button><Button onClick={() => void saveTarget()} disabled={saving}>{saving ? 'Saving…' : editingTarget ? 'Save Changes' : 'Add Target'}</Button></>}>
        <div className="space-y-4"><div><Label required>Job / Target Description</Label><Textarea value={targetForm.description} onChange={(event) => setTargetForm((form) => ({ ...form, description: event.target.value }))} placeholder="Describe the specific job, expected output, or assignment…" className="min-h-28" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label required>Measurement</Label><Select value={targetForm.measureType} onChange={(event) => setTargetForm((form) => ({ ...form, measureType: event.target.value as PerformanceTarget['measureType'] }))}><option value="COUNT">Quantity / Count</option><option value="PERCENTAGE">Percentage</option><option value="MILESTONE">Milestone</option><option value="COMPLIANCE">Compliance</option></Select></div><div><Label required>{targetForm.measureType === 'COUNT' ? 'Target Quantity' : 'Target Value'}</Label><Input type="number" min="0.01" step="0.01" value={targetForm.targetValue} onChange={(event) => setTargetForm((form) => ({ ...form, targetValue: event.target.value }))} placeholder="e.g. 6" /></div><div><Label required>Unit</Label><Input value={targetForm.unit} onChange={(event) => setTargetForm((form) => ({ ...form, unit: event.target.value }))} placeholder="reports, projects, %…" /></div><div><Label required>Weight within Accomplishment</Label><Input type="number" min="0" max="100" step="0.01" value={targetForm.weight} onChange={(event) => setTargetForm((form) => ({ ...form, weight: event.target.value }))} placeholder="e.g. 25" /></div><div className="sm:col-span-2"><Label>Due Date</Label><Input type="date" value={targetForm.dueDate} onChange={(event) => setTargetForm((form) => ({ ...form, dueDate: event.target.value }))} /></div></div><p className="text-xs text-slate-500">Enter the required quantity and unit for count-based targets. All target weights in the plan must total 100% before activation.</p></div>
      </Dialog>

      <Dialog open={!!accomplishmentTarget} onClose={() => setAccomplishmentTarget(null)} title="Add Accomplishment" description={accomplishmentTarget ? `${accomplishmentTarget.target.description} · Target ${accomplishmentTarget.target.targetValue} ${accomplishmentTarget.target.unit}` : undefined} size="md" footer={<><Button variant="outline" onClick={() => setAccomplishmentTarget(null)}>Cancel</Button><Button onClick={() => void saveAccomplishment()} disabled={saving || !accomplishmentForm.description.trim() || !(Number(accomplishmentForm.quantity) > 0)}>{saving ? 'Saving…' : 'Record Accomplishment'}</Button></>}>
        <div className="space-y-4"><div><Label required>Accomplishment Description</Label><Textarea value={accomplishmentForm.description} onChange={(event) => setAccomplishmentForm((form) => ({ ...form, description: event.target.value }))} placeholder="Describe the completed output or work delivered…" className="min-h-24" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label required>Quantity Accomplished</Label><Input type="number" min="0.01" step="0.01" value={accomplishmentForm.quantity} onChange={(event) => setAccomplishmentForm((form) => ({ ...form, quantity: event.target.value }))} placeholder="e.g. 3" /></div><div><Label>Date Accomplished</Label><Input type="date" value={accomplishmentForm.accomplishedOn} onChange={(event) => setAccomplishmentForm((form) => ({ ...form, accomplishedOn: event.target.value }))} /></div></div><div><Label>Evidence Files</Label><Input type="file" multiple onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))} /><p className="mt-1 text-xs text-slate-500">Attach one or more supporting documents, images, spreadsheets, or other evidence files.</p>{evidenceFiles.length > 0 && <div className="mt-2 space-y-1">{evidenceFiles.map((file) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><Paperclip className="h-3.5 w-3.5" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span>{(file.size / 1024).toFixed(1)} KB</span></div>)}</div>}</div></div>
      </Dialog>

      <Dialog open={!!assignmentPosition} onClose={() => setAssignmentPosition(null)} title="Assign Employee to Position" description={assignmentPosition?.title} size="md" footer={<><Button variant="outline" onClick={() => setAssignmentPosition(null)}>Cancel</Button><Button onClick={() => void saveAssignment()} disabled={saving || !assignmentForm.employeeUserId || !assignmentForm.currentLevel}>{saving ? 'Saving…' : 'Assign Employee'}</Button></>}>
        <div className="space-y-4">
          <div><Label required>Employee</Label><Select value={assignmentForm.employeeUserId} onChange={(event) => setAssignmentForm((form) => ({ ...form, employeeUserId: event.target.value }))}><option value="">Select an active employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.employeeNo} — {employee.position ?? 'No position'}</option>)}</Select></div>
          <div><Label required>Current Level</Label><Select value={assignmentForm.currentLevel} onChange={(event) => setAssignmentForm((form) => ({ ...form, currentLevel: event.target.value }))}><option value="">Select current level</option><option value="1">Level 1</option><option value="2">Level 2</option><option value="3">Level 3</option><option value="4">Level 4</option></Select></div>
          <div><Label>Detail Order / Assignment Reference</Label><Textarea value={assignmentForm.detailOrder} onChange={(event) => setAssignmentForm((form) => ({ ...form, detailOrder: event.target.value }))} placeholder="Enter the detail order number, temporary assignment, or reason…" /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label>Effective Start</Label><Input type="date" value={assignmentForm.effectiveStart} onChange={(event) => setAssignmentForm((form) => ({ ...form, effectiveStart: event.target.value }))} /></div><div><Label>Effective End</Label><Input type="date" value={assignmentForm.effectiveEnd} onChange={(event) => setAssignmentForm((form) => ({ ...form, effectiveEnd: event.target.value }))} /></div></div>
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800">This assignment applies only to Performance Management. It does not change the employee’s official position in Administration.</div>
        </div>
      </Dialog>

      <Dialog open={!!drPlPosition} onClose={() => setDrPlPosition(null)} title="Duties and Responsibilities / Position Level" description={drPlPosition?.title} size="xl" headerActions={<Button variant="outline" size="icon" className="h-7 w-7" aria-label="Edit position details" title="Edit Position Details" onClick={openPositionDetails}><Pencil className="h-3.5 w-3.5" /></Button>}>
        {drPlPosition && (() => {
          const profile = profiles.find((item) => item.positionId === drPlPosition.id);
          if (!profile) return <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center"><FileText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">No DR / PL record yet</p><p className="mt-1 text-sm text-slate-500">This position is ready for its duties, responsibilities, competencies, and position levels to be encoded.</p></div>;
          const categoryNames = profile.categories?.length ? profile.categories : [...new Set(profile.duties.map((duty) => duty.kra))];
          const kraGroups = categoryNames.map((name) => ({ name, weight: profile.duties.find((duty) => duty.kra === name)?.kraWeight ?? 0, duties: profile.duties.filter((duty) => duty.kra === name) }));
          return <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-400">Employment Level</p><p className="mt-1 text-sm font-semibold text-slate-800">{profile.employmentLevel || '—'}</p></div><div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-400">Reports To</p><p className="mt-1 text-sm font-semibold text-slate-800">{profile.reportsTo || '—'}</p></div><div className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-slate-400">Area of Work</p><p className="mt-1 text-sm font-semibold text-slate-800">{profile.areaOfWork || '—'}</p></div></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Purpose of the Position</p><p className="mt-2 text-sm leading-6 text-slate-700">{profile.purpose}</p></div>
            <div className="flex justify-end"><Button size="sm" onClick={() => openCategoryEditor()}><Plus className="h-3.5 w-3.5" /> Add Category</Button></div>
            <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Duty / Responsibility</th><th className="w-80 px-4 py-3">Competencies Needed</th><th className="w-24 px-4 py-3 text-center">Actions</th></tr></thead>{kraGroups.map((group) => <tbody key={group.name} className="divide-y divide-slate-100"><tr className="bg-brand-50"><th colSpan={3} className="px-4 py-2.5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-brand-800">{group.name}</span><span className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-7 w-7" aria-label={`Edit category ${group.name}`} title="Edit Category" onClick={() => openCategoryEditor(group.name)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="outline" size="icon" className="h-7 w-7" aria-label={`Add duty to ${group.name}`} title="Add Duty" onClick={() => openDutyEditor(group.name)}><Plus className="h-3.5 w-3.5" /></Button></span></div></th></tr>{group.duties.map((duty) => <tr key={duty.id} className="bg-surface"><td className="px-4 py-3"><p className="font-medium text-slate-800">{duty.description}</p></td><td className="px-4 py-3 text-xs text-slate-600">{duty.competency}</td><td className="px-4 py-3 text-center"><Button variant="outline" size="icon" className="h-7 w-7" aria-label={`Edit duty ${duty.description}`} title="Edit Duty" onClick={() => openDutyEditor(group.name, duty)}><Pencil className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody>)}</table></div>
            {profile.sourceDocument && <p className="text-xs text-slate-400">Source: {profile.sourceDocument}</p>}
          </div>;
        })()}
      </Dialog>
      <Dialog open={positionDetailsOpen} onClose={() => setPositionDetailsOpen(false)} title="Edit Position Details" description={drPlPosition?.title} size="md" footer={<><Button variant="outline" onClick={() => setPositionDetailsOpen(false)}>Cancel</Button><Button onClick={() => void savePositionDetails()} disabled={saving || !positionDetailsForm.employmentLevel.trim() || !positionDetailsForm.reportsTo.trim() || !positionDetailsForm.areaOfWork.trim() || !positionDetailsForm.purpose.trim() || !Number.isInteger(Number(positionDetailsForm.maxLevel)) || Number(positionDetailsForm.maxLevel) < 2 || Number(positionDetailsForm.maxLevel) > 20 || positionDetailsForm.competencyNotes.some((note) => !note.name.trim() || !note.description.trim())}>{saving ? 'Saving…' : 'Save Changes'}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label required>Employment Level</Label><Input value={positionDetailsForm.employmentLevel} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, employmentLevel: event.target.value }))} /></div><div><Label required>Reports To</Label><Input value={positionDetailsForm.reportsTo} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, reportsTo: event.target.value }))} /></div></div>
          <div><Label required>Area of Work</Label><Input value={positionDetailsForm.areaOfWork} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, areaOfWork: event.target.value }))} /></div>
          <div><Label required>Purpose of the Position</Label><Textarea className="min-h-28" value={positionDetailsForm.purpose} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, purpose: event.target.value }))} /></div>
          <div><Label required>Max Level</Label><Input type="number" min="2" max="20" step="1" value={positionDetailsForm.maxLevel} onChange={(event) => setPositionMaxLevel(event.target.value)} /><p className="mt-1 text-xs text-slate-500">Creates employee Skillset columns from Level 2 through the maximum.</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Competency Level Notes</p>
            <div className="mt-3 grid gap-3">{positionDetailsForm.competencyNotes.map((note, index) => <div key={note.level} className="grid gap-2 rounded-lg border border-slate-200 bg-surface p-3 sm:grid-cols-[7rem_1fr]"><div><Label required>Level {note.level} Name</Label><Input value={note.name} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, competencyNotes: form.competencyNotes.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} /></div><div><Label required>Description</Label><Textarea className="min-h-20" value={note.description} onChange={(event) => setPositionDetailsForm((form) => ({ ...form, competencyNotes: form.competencyNotes.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) }))} /></div></div>)}</div>
          </div>
        </div>
      </Dialog>
      <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} title={editingCategory ? 'Edit DR / PL Category' : 'Add DR / PL Category'} description={drPlPosition?.title} size="sm" footer={<div className="flex w-full items-center justify-between">{editingCategory ? <Button variant="destructive" onClick={() => setDeleteCategoryOpen(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button> : <span />}<div className="flex gap-2"><Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button><Button onClick={() => void saveCategory()} disabled={saving || !categoryForm.name.trim()}>{saving ? 'Saving…' : editingCategory ? 'Save Changes' : 'Add Category'}</Button></div></div>}>
        <div><Label required>Category Name</Label><Input value={categoryForm.name} onChange={(event) => setCategoryForm({ name: event.target.value })} placeholder="e.g. Records Management" /></div>
      </Dialog>
      <Dialog open={!!dutyCategory} onClose={() => setDutyCategory(null)} title={editingDutyId ? 'Edit Duty / Responsibility' : 'Add Duty / Responsibility'} description={dutyCategory ?? undefined} size="md" footer={<div className="flex w-full items-center justify-between">{editingDutyId ? <Button variant="destructive" onClick={() => setDeleteDutyOpen(true)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button> : <span />}<div className="flex gap-2"><Button variant="outline" onClick={() => setDutyCategory(null)}>Cancel</Button><Button onClick={() => void saveDuty()} disabled={saving || !dutyForm.description.trim() || !dutyForm.competency.trim()}>{saving ? 'Saving…' : editingDutyId ? 'Save Changes' : 'Add Duty'}</Button></div></div>}>
        <div className="space-y-4">
          <div><Label required>Duty / Responsibility</Label><Textarea value={dutyForm.description} onChange={(event) => setDutyForm((form) => ({ ...form, description: event.target.value }))} placeholder="Describe the duty or responsibility…" /></div>
          <div><Label required>Competencies Needed</Label><Textarea value={dutyForm.competency} onChange={(event) => setDutyForm((form) => ({ ...form, competency: event.target.value }))} placeholder="Describe the knowledge, skill, or competency needed…" /></div>
        </div>
      </Dialog>
      <ConfirmDialog open={deleteCategoryOpen} onClose={() => setDeleteCategoryOpen(false)} onConfirm={() => void deleteCategory()} title="Delete DR / PL Category?" description={`Delete ${editingCategory ?? 'this category'} and all duties under it? This will also remove them from employee Skillsets.`} confirmLabel={saving ? 'Deleting…' : 'Delete Category'} destructive />
      <ConfirmDialog open={deleteDutyOpen} onClose={() => setDeleteDutyOpen(false)} onConfirm={() => void deleteDuty()} title="Delete Duty / Responsibility?" description="Delete this duty from the position DR / PL and employee Skillsets?" confirmLabel={saving ? 'Deleting…' : 'Delete Duty'} destructive />
    </div>
  );
}
