jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn() })),
}));

import {
  SETTING_REGISTRY,
  parseSettingValue,
  serializeSettingValue,
  validateSettingUpdate,
  getRevision,
  buildRuntimeConfig,
  buildAdminConfig,
  PDF_ACCESS_OPTIONS
} from '../../src/config/systemSettings';

describe('systemSettings registry', () => {
  it('defines every editable setting with a default', () => {
    expect(Object.keys(SETTING_REGISTRY).length).toBeGreaterThanOrEqual(12);
    for (const [key, def] of Object.entries(SETTING_REGISTRY)) {
      expect(def.default).not.toBeUndefined();
    }
  });

  it('exposes the PDF access policy options', () => {
    expect(PDF_ACCESS_OPTIONS).toEqual(['admin_only', 'admin_supervisor', 'disabled']);
  });
});

describe('parseSettingValue', () => {
  it('parses numbers, booleans, and enums', () => {
    expect(parseSettingValue('auth.session_timeout_minutes', '45')).toBe(45);
    expect(parseSettingValue('export.pdf_watermark_enabled', 'true')).toBe(true);
    expect(parseSettingValue('export.pdf_watermark_enabled', 'false')).toBe(false);
    expect(parseSettingValue('export.pdf_access', 'admin_only')).toBe('admin_only');
    expect(parseSettingValue('bac.general.limit_g100ml', '0.05')).toBe(0.05);
  });

  it('rejects malformed numbers and booleans', () => {
    expect(() => parseSettingValue('auth.session_timeout_minutes', 'abc')).toThrow();
    expect(() => parseSettingValue('export.pdf_watermark_enabled', 'yes')).toThrow();
  });

  it('passes unknown keys through as strings', () => {
    expect(parseSettingValue('legacy.key', 'anything')).toBe('anything');
  });
});

describe('serializeSettingValue', () => {
  it('round-trips booleans', () => {
    expect(serializeSettingValue('export.pdf_watermark_enabled', true)).toBe('true');
    expect(serializeSettingValue('export.pdf_watermark_enabled', false)).toBe('false');
  });
});

describe('validateSettingUpdate', () => {
  it('accepts valid values', () => {
    expect(
      validateSettingUpdate({
        'auth.session_timeout_minutes': 45,
        'export.pdf_access': 'admin_only',
        'export.pdf_watermark_enabled': false,
        'bac.professional.limit_g100ml': 0.03
      })
    ).toEqual([]);
  });

  it('rejects unknown keys', () => {
    expect(validateSettingUpdate({ 'not.a.setting': 1 })).toEqual([
      'Unknown setting key: not.a.setting'
    ]);
  });

  it('rejects direct revision updates', () => {
    expect(validateSettingUpdate({ 'system.config_revision': 9 })).toEqual([
      'Setting system.config_revision cannot be updated directly.'
    ]);
  });

  it('rejects out-of-range numbers', () => {
    const errors = validateSettingUpdate({
      'auth.session_timeout_minutes': 2,
      'alerts.failure_rate_change_points': 200
    });
    expect(errors.join(' ')).toContain('at least 5');
    expect(errors.join(' ')).toContain('at most 100');
  });

  it('rejects invalid enum values and control characters', () => {
    expect(validateSettingUpdate({ 'export.pdf_access': 'everyone' })[0]).toContain(
      'admin_only'
    );
    expect(validateSettingUpdate({ 'export.pdf_watermark_text': 'a\u0007b' })[0]).toContain(
      'control'
    );
  });
});

describe('revision and config builders', () => {
  it('defaults the revision to 1', () => {
    expect(getRevision({})).toBe(1);
    expect(getRevision({ 'system.config_revision': '7' })).toBe(7);
  });

  it('builds a runtime config from stored values with defaults', () => {
    const runtime = buildRuntimeConfig({});
    expect(runtime.auth.sessionTimeoutMinutes).toBe(30);
    expect(runtime.export.pdfAccess).toBe('admin_supervisor');
    expect(runtime.export.pdfWatermarkEnabled).toBe(true);
    expect(runtime.export.pdfWatermarkText).toBe('IntegriScan Court Evidence');
    expect(runtime.bacLimits).toEqual([
      { key: 'general', label: 'General Driver', limitG100ml: 0.05, limitMg1000ml: 0.24 },
      { key: 'professional', label: 'Professional Driver', limitG100ml: 0.02, limitMg1000ml: 0.1 }
    ]);
  });

  it('overrides stored values', () => {
    const runtime = buildRuntimeConfig({
      'auth.session_timeout_minutes': '60',
      'bac.professional.limit_g100ml': '0.03'
    });
    expect(runtime.auth.sessionTimeoutMinutes).toBe(60);
    expect(runtime.bacLimits[1].limitG100ml).toBe(0.03);
  });

  it('builds an admin config with revision and audit metadata', () => {
    const config = buildAdminConfig({
      'system.config_revision': '4',
      'system.config_revision_updated_at': '2026-08-02T10:00:00Z',
      'system.config_revision_updated_by': 'admin@example.com'
    });
    expect(config.revision).toBe(4);
    expect(config.updatedAt).toBe('2026-08-02T10:00:00Z');
    expect(config.updatedBy).toBe('admin@example.com');
  });
});
