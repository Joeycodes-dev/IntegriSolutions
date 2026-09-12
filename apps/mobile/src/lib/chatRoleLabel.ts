export function roleLabel(roleId: number): string {
  if (roleId === 3) return 'Admin';
  if (roleId === 2) return 'Supervisor';
  if (roleId === 1) return 'Officer';
  return 'Unknown role';
}
