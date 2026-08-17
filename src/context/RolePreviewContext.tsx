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
}));

interface RolePreviewContextValue {
  effectiveRole: AppRole;
  isPreviewing: boolean;
  previewDepartmentId: DepartmentId | null;
  previewLabel: string;
  setPreviewRole: (role: AppRole | null) => void;
  setPreviewDepartmentManager: (departmentId: DepartmentId) => void;
  returnToAdministrator: () => void;
}

const RolePreviewContext = createContext<RolePreviewContextValue | undefined>(undefined);

export function RolePreviewProvider({ children }: { children: ReactNode }) {
  const [previewRole, setPreviewRoleState] = useState<AppRole | null>(null);
  const [previewDepartmentId, setPreviewDepartmentId] = useState<DepartmentId | null>(null);

  const effectiveRole = previewRole ?? 'Administrator';

  let previewLabel: string = effectiveRole;
  if (previewRole === 'Department Manager' && previewDepartmentId) {
    previewLabel = `Department Manager — ${DEPT_MAP[previewDepartmentId].name}`;
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
          if (role !== 'Department Manager') setPreviewDepartmentId(null);
        },
        setPreviewDepartmentManager: (departmentId) => {
          setPreviewRoleState('Department Manager');
          setPreviewDepartmentId(departmentId);
        },
        returnToAdministrator: () => {
          setPreviewRoleState(null);
          setPreviewDepartmentId(null);
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
