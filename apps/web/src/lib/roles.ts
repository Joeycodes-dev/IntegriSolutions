export const ROLE_OFFICER = 1;
export const ROLE_SUPERVISOR = 2;
export const ROLE_ADMIN = 3;

export function isAdmin(roleId: number): boolean {
  return roleId === ROLE_ADMIN;
}

export function isSupervisor(roleId: number): boolean {
  return roleId === ROLE_SUPERVISOR;
}

export function canAccessWebPortal(roleId: number): boolean {
  return roleId === ROLE_SUPERVISOR || roleId === ROLE_ADMIN;
}
