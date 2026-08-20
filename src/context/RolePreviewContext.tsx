import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppRole, DepartmentId } from '@/lib/types';
import { DEPARTMENTS, DEPT_MAP, EMPLOYEE_MAP } from '@/lib/mockData';
import { useAuth } from '@/context/AuthContext';

export const PREVIEWABLE_ROLES: AppRole[] = [
  'Employee',
  'Secretary',
  'Office Secretary',
  'Department Secretary',
  'Supervisor',
  'Department Manager',
  'General Manager',
  'Board Member',
  'Process Owner',
  'Auditor',
];

export const DEPARTMENT_MANAGER_OPTIONS = DEPARTMENTS.map((d) => ({
  departmentId: d.id,
  departmentName: d.name,
  managerName: EMPLOYEE_MAP[d.managerId]?.name ?? `${d.shortName} Department Manager`,
  position: EMPLOYEE_MAP[d.managerId]?.position ?? `${d.shortName} Department Manager`,
}));

export const ISD_PREVIEW_OPTIONS: {
  id: string;
  role: AppRole;
  departmentId: DepartmentId;
  name: string;
  position: string;
  office: string;
}[] = [
  {
    id: 'isd-manager',
    role: 'Department Manager',
    departmentId: 'ISD',
    name: 'Mario Calatan',
    position: 'Institutional Services Department Manager',
    office: 'Office of the Department Manager',
  },
  {
    id: 'isd-secretary',
    role: 'Department Secretary',
    departmentId: 'ISD',
    name: 'ISD Secretary',
    position: 'Secretary',
    office: 'Office of the Department Manager',
  },
  {
    id: 'isd-gso',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'General Services Officer',
    position: 'General Services Officer',
    office: 'General Services Office',
  },
  {
    id: 'isd-memo',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Materials and Equipment Management Officer',
    position: 'Materials and Equipment Management Officer',
    office: 'Materials and Equipment Management Office',
  },
  {
    id: 'isd-cro',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Community Relations Officer',
    position: 'Community Relations Officer',
    office: 'Community Relations Office',
  },
  {
    id: 'isd-hr',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Human Resource Officer',
    position: 'Human Resource Officer',
    office: 'Human Resource Office',
  },
  {
    id: 'isd-employee',
    role: 'Employee',
    departmentId: 'ISD',
    name: 'ISD Employee',
    position: 'Rank and File',
    office: 'Institutional Services Department',
  },
];

interface RolePreviewContextValue {
  effectiveRole: AppRole;
  isPreviewing: boolean;
  previewDepartmentId: DepartmentId | null;
  previewLabel: string;
  previewOffice: string | null;
  previewPosition: string | null;
  setPreviewRole: (role: AppRole | null) => void;
  setPreviewDepartmentManager: (departmentId: DepartmentId) => void;
  setPreviewPersona: (role: AppRole, departmentId: DepartmentId, label: string, office?: string, position?: string) => void;
  returnToAdministrator: () => void;
}

const RolePreviewContext = createContext<RolePreviewContextValue | undefined>(undefined);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [previewRole, setPreviewRoleState] = useState<AppRole | null>(null);
  const [previewDepartmentId, setPreviewDepartmentId] = useState<DepartmentId | null>(null);
  const [previewLabelOverride, setPreviewLabelOverride] = useState<string | null>(null);
  const [previewOffice, setPreviewOffice] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<string | null>(null);

  const signedInRole = (user?.role ?? 'Employee') as AppRole;
  const signedInAsAdministrator = signedInRole === 'Administrator'
    || (user?.roles ?? []).some((role) => role.split(' (')[0] === 'Administrator');
  const isPreviewing = signedInAsAdministrator && previewRole !== null;
  const effectiveRole = isPreviewing ? previewRole : signedInRole;

  useEffect(() => {
    setPreviewRoleState(null);
    setPreviewDepartmentId(null);
    setPreviewLabelOverride(null);
    setPreviewOffice(null);
    setPreviewPosition(null);
  }, [user?.id]);

  useEffect(() => {
    if (signedInAsAdministrator) return;
    setPreviewRoleState(null);
    setPreviewDepartmentId(null);
    setPreviewLabelOverride(null);
    setPreviewOffice(null);
    setPreviewPosition(null);
  }, [signedInAsAdministrator]);

  let previewLabel: string = previewLabelOverride ?? effectiveRole;
  if (previewRole === 'Department Manager' && previewDepartmentId) {
    previewLabel = previewLabelOverride ?? `Department Manager — ${DEPT_MAP[previewDepartmentId].name}`;
  }

  return (
    <RolePreviewContext.Provider
      value={{
        effectiveRole,
        isPreviewing,
        previewDepartmentId,
        previewLabel,
        previewOffice,
        previewPosition,
        setPreviewRole: (role) => {
          if (!signedInAsAdministrator) return;
          setPreviewRoleState(role);
          setPreviewLabelOverride(null);
          setPreviewOffice(null);
          setPreviewPosition(null);
          if (role !== 'Department Manager') setPreviewDepartmentId(null);
        },
        setPreviewDepartmentManager: (departmentId) => {
          if (!signedInAsAdministrator) return;
          setPreviewRoleState('Department Manager');
          setPreviewDepartmentId(departmentId);
          setPreviewLabelOverride(null);
        },
        setPreviewPersona: (role, departmentId, label, office, position) => {
          if (!signedInAsAdministrator) return;
          setPreviewRoleState(role);
          setPreviewDepartmentId(departmentId);
          setPreviewLabelOverride(label);
          setPreviewOffice(office ?? null);
          setPreviewPosition(position ?? null);
        },
        returnToAdministrator: () => {
          setPreviewRoleState(null);
          setPreviewDepartmentId(null);
          setPreviewLabelOverride(null);
          setPreviewOffice(null);
          setPreviewPosition(null);
        },
      }}
    >
      {children}
    </RolePreviewContext.Provider>
  );
}

export function useRolePreview() {
  const ctx = useContext(RolePreviewContext);
  if (!ctx) throw new Error('useRolePreview must be used within RolePreviewProvider');
  return ctx;
}
