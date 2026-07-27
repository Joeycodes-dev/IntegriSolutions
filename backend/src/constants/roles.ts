export const ROLE_OFFICER = 1;
export const ROLE_SUPERVISOR = 2;
export const ROLE_ADMIN = 3;

export const PORTAL_ROLES = [ROLE_SUPERVISOR, ROLE_ADMIN] as const;

export function roleLabel(roleId: number): string {
  if (roleId === ROLE_ADMIN) return 'Admin';
  if (roleId === ROLE_SUPERVISOR) return 'Supervisor';
  if (roleId === ROLE_OFFICER) return 'Officer';
  return 'Unknown';
}

export function portalUserId(officerId: number, roleId: number): string {
  const slug = roleId === ROLE_ADMIN ? 'admin' : 'supervisor';
  return `usr_${slug}_${String(officerId).padStart(2, '0')}`;
}
