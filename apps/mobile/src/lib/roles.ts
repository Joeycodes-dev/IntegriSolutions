export const ROLE_OFFICER = 1;

export function canAccessMobileApp(roleId: number): boolean {
  return roleId === ROLE_OFFICER;
}