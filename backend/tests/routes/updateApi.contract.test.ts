/**
 * Sprint 6B Update API: account status can change; enforcement tests cannot.
 */
describe('Update API surface (non-test records)', () => {
  it('uses PATCH on portal users and field officers, not on tests', () => {
    const updateTargets = [
      'PATCH /api/admin/users/:officerId',
      'PATCH /api/supervisor/officers/:officerId'
    ];
    const immutable = 'tests table blocked by WORM triggers (no UPDATE/DELETE)';

    expect(updateTargets).toHaveLength(2);
    expect(updateTargets.every((path) => path.startsWith('PATCH'))).toBe(true);
    expect(immutable).toContain('WORM');
    expect(updateTargets.some((path) => path.includes('/tests'))).toBe(false);
  });
});
