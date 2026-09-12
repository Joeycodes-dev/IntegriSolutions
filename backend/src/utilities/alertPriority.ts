// Shared by routes/alerts.ts (officer-facing) and routes/supervisor/alerts.ts
// (issuing/editing) so the critical > high > medium > low ordering — and what
// counts as a priority *increase* for material-change detection — can never
// drift between the two.
export function priorityWeight(priority: unknown): number {
  if (priority === 'critical') return 4;
  if (priority === 'high') return 3;
  if (priority === 'low') return 1;
  return 2;
}
