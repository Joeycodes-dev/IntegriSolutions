import { createLocalReceiptNumber } from '../../src/lib/receipt';

describe('local receipt numbers', () => {
  it('is stable for the same planned record and capture date', () => {
    const first = createLocalReceiptNumber(
      'planned-record-1',
      '2026-09-25T01:02:03.000Z',
    );
    const second = createLocalReceiptNumber(
      'planned-record-1',
      '2026-09-25T01:02:03.000Z',
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^IS-20260925-[A-F0-9]{16}$/);
  });

  it('changes for a different planned record', () => {
    expect(
      createLocalReceiptNumber('planned-record-2', '2026-09-25T01:02:03.000Z'),
    ).not.toBe(
      createLocalReceiptNumber('planned-record-1', '2026-09-25T01:02:03.000Z'),
    );
  });
});
