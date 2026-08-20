import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useRolePreview } from '@/context/RolePreviewContext';
import { canSeeAdministration } from '@/lib/permissions';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AdministratorRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { effectiveRole } = useRolePreview();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!canSeeAdministration(effectiveRole)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}
