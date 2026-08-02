import {
  redactDriverName,
  redactDriverId
} from '../../src/utilities/driverRedaction';

describe('driverRedaction', () => {
  describe('redactDriverName', () => {
    it('masks all but the first letter of each part', () => {
      expect(redactDriverName('John Doe')).toBe('J*** D**');
    });

    it('handles multiple middle parts', () => {
      expect(redactDriverName('  mary  jane ann ')).toBe('M*** J*** A**');
    });

    it('keeps at least one asterisk for single-letter parts', () => {
      expect(redactDriverName('A')).toBe('A*');
    });

    it('returns empty string for empty input', () => {
      expect(redactDriverName('')).toBe('');
      expect(redactDriverName('   ')).toBe('');
    });

    it('normalises case of the visible initial', () => {
      expect(redactDriverName('john doe')).toBe('J*** D**');
    });
  });

  describe('redactDriverId', () => {
    it('shows only the last four characters', () => {
      expect(redactDriverId('123456789012')).toBe('********9012');
    });

    it('leaves short ids fully visible', () => {
      expect(redactDriverId('AB12')).toBe('AB12');
    });

    it('returns empty string for empty input', () => {
      expect(redactDriverId('')).toBe('');
      expect(redactDriverId('   ')).toBe('');
    });
  });
});
