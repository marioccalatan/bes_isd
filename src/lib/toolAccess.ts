import type { AppRole, AppTool } from './types';

export interface ToolAccessIdentity {
  role: AppRole;
  departmentCode?: string | null;
  officeName?: string | null;
  positionTitle?: string | null;
}

const same = (left?: string | null, right?: string | null) =>
  String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();

export function canAccessTool(tool: AppTool, identity: ToolAccessIdentity) {
  const activeGrants = tool.access.filter((grant) => grant.level !== 'EXISTING');
  if (identity.role === 'Administrator') {
    return activeGrants.some((grant) => same(grant.departmentId, identity.departmentCode));
  }
  return activeGrants.some((grant) => {
    if (!same(grant.departmentId, identity.departmentCode)) return false;
    if (grant.position && !same(grant.position, identity.positionTitle)) return false;
    if (grant.unit && !same(grant.unit, identity.officeName)) return false;
    return true;
  });
}
