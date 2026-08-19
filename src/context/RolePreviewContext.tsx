import { createContext, useContext, useState, type ReactNode } from 'react';
import type { AppRole, DepartmentId } from '@/lib/types';
import { DEPARTMENTS, DEPT_MAP, EMPLOYEE_MAP } from '@/lib/mockData';

export const PREVIEWABLE_ROLES: AppRole[] = [
  'Employee',
  'Secretary',
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
    position: 'OIC - ISD Manager',
    office: 'Office of the Department Manager',
  },
  {
    id: 'isd-secretary',
    role: 'Secretary',
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
    position: 'Officer',
    office: 'General Services Office',
  },
  {
    id: 'isd-memo',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Materials and Equipment Management Officer',
    position: 'Officer',
    office: 'Materials and Equipment Management Office',
  },
  {
    id: 'isd-cro',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Community Relations Officer',
    position: 'Officer',
    office: 'Community Relations Office',
  },
  {
    id: 'isd-hr',
    role: 'Supervisor',
    departmentId: 'ISD',
    name: 'Human Resource Officer',
    position: 'Officer',
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
  setPreviewRole: (role: AppRole | null) => void;
  setPreviewDepartmentManager: (departmentId: DepartmentId) => void;
  setPreviewPersona: (role: AppRole, departmentId: DepartmentId, label: string) => void;
  returnToAdministrator: () => void;
}

const RolePreviewContext = createContext<RolePreviewContextValue | undefined>(undefined);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const [previewRole, setPreviewRoleState] = useState<AppRole | null>(null);
  const [previewDepartmentId, setPreviewDepartmentId] = useState<DepartmentId | null>(null);
  const [previewLabelOverride, setPreviewLabelOverride] = useState<string | null>(null);

  const effectiveRole = previewRole ?? 'Administrator';

  let previewLabel: string = previewLabelOverride ?? effectiveRole;
  if (previewRole === 'Department Manager' && previewDepartmentId) {
    previewLabel = previewLabelOverride ?? `Department Manager — ${DEPT_MAP[previewDepartmentId].name}`;
  }

  return (
    <RolePreviewContext.Provider
      value={{
        effectiveRole,
        isPreviewing: previewRole !== null,
        previewDepartmentId,
        previewLabel,
        setPreviewRole: (role) => {
          setPreviewRoleState(role);
          setPreviewLabelOverride(null);
          if (role !== 'Department Manager') setPreviewDepartmentId(null);
        },
        setPreviewDepartmentManager: (departmentId) => {
          setPreviewRoleState('Department Manager');
          setPreviewDepartmentId(departmentId);
          setPreviewLabelOverride(null);
        },
        setPreviewPersona: (role, departmentId, label) => {
          setPreviewRoleState(role);
          setPreviewDepartmentId(departmentId);
          setPreviewLabelOverride(label);
        },
        returnToAdministrator: () => {
          setPreviewRoleState(null);
          setPreviewDepartmentId(null);
          setPreviewLabelOverride(null);
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
