import { roleLabel } from '../../src/lib/chatRoleLabel';

describe('chat roleLabel', () => {
  it('maps known role ids to their labels', () => {
    expect(roleLabel(1)).toBe('Officer');
    expect(roleLabel(2)).toBe('Supervisor');
    expect(roleLabel(3)).toBe('Admin');
  });

  it('does not silently default to Officer for an unrecognized or missing role id', () => {
    expect(roleLabel(0)).toBe('Unknown role');
    expect(roleLabel(99)).toBe('Unknown role');
    expect(roleLabel(NaN)).toBe('Unknown role');
  });
});
