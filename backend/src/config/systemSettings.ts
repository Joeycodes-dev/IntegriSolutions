import { createClient } from '@supabase/supabase-js';
import { writeAuditLog } from '../utilities/auditLog';

const serviceSupabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

export type SettingKind = 'number' | 'boolean' | 'string' | 'enum';

interface SettingDef {
  kind: SettingKind;
  default: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  enumValues?: readonly string[];
}

export const PDF_ACCESS_OPTIONS = ['admin_only', 'admin_supervisor', 'disabled'] as const;
export type PdfAccessPolicy = (typeof PDF_ACCESS_OPTIONS)[number];

export const BAC_CATEGORY_KEYS = ['general', 'professional'] as const;
export type BacCategoryKey = (typeof BAC_CATEGORY_KEYS)[number];

/** Single source of truth for every editable configuration key. */
export const SETTING_REGISTRY: Record<string, SettingDef> = {
  'auth.session_timeout_minutes': { kind: 'number', min: 5, max: 1440, default: 30 },
  'export.pdf_watermark_enabled': { kind: 'boolean', default: true },
  'export.pdf_watermark_text': { kind: 'string', maxLength: 120, default: 'IntegriScan Court Evidence' },
  'export.pdf_access': { kind: 'enum', enumValues: PDF_ACCESS_OPTIONS, default: 'admin_supervisor' },
  'alerts.integrity_flag_count': { kind: 'number', min: 0, max: 1000000, default: 1 },
  'alerts.failure_rate_change_points': { kind: 'number', min: 0, max: 100, default: 1 },
  'alerts.roadblock_minimum_tests': { kind: 'number', min: 1, max: 1000000, default: 3 },
  'alerts.avg_failing_bac_multiple': { kind: 'number', min: 0.1, max: 100, default: 2 },
  'bac.general.limit_g100ml': { kind: 'number', min: 0, max: 5, default: 0.05 },
  'bac.general.limit_mg1000ml': { kind: 'number', min: 0, max: 24, default: 0.24 },
  'bac.professional.limit_g100ml': { kind: 'number', min: 0, max: 5, default: 0.02 },
  'bac.professional.limit_mg1000ml': { kind: 'number', min: 0, max: 24, default: 0.10 },
  'system.config_revision': { kind: 'number', min: 1, max: 1000000000, default: 1 }
};

export type RawSettings = Record<string, string>;

export class SettingsValidationError extends Error {}
export class SettingsConflictError extends Error {
  constructor(public currentRevision: number) {
    super(`Configuration was updated by another administrator (revision ${currentRevision}).`);
  }
}

function round(value: number, digits = 4): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

/** Coerces a stored string into the registry's typed value. */
export function parseSettingValue(key: string, raw: string): unknown {
  const def = SETTING_REGISTRY[key];
  if (!def) return raw;

  if (def.kind === 'number') {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      throw new SettingsValidationError(`Setting ${key} must be a number.`);
    }
    return round(value);
  }
  if (def.kind === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    throw new SettingsValidationError(`Setting ${key} must be true or false.`);
  }
  return raw;
}

/** Serializes a typed value for storage. */
export function serializeSettingValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Validates an update payload; returns a list of human-readable errors. */
export function validateSettingUpdate(values: Record<string, unknown>): string[] {
  const errors: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const def = SETTING_REGISTRY[key];
    if (!def) {
      errors.push(`Unknown setting key: ${key}`);
      continue;
    }
    if (key === 'system.config_revision') {
      errors.push(`Setting ${key} cannot be updated directly.`);
      continue;
    }

    if (def.kind === 'number') {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        errors.push(`${key} must be a number.`);
        continue;
      }
      if (def.min != null && numeric < def.min) {
        errors.push(`${key} must be at least ${def.min}.`);
      }
      if (def.max != null && numeric > def.max) {
        errors.push(`${key} must be at most ${def.max}.`);
      }
    } else if (def.kind === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`${key} must be a boolean.`);
      }
    } else if (def.kind === 'string') {
      if (typeof value !== 'string') {
        errors.push(`${key} must be text.`);
      } else if (def.maxLength != null && value.length > def.maxLength) {
        errors.push(`${key} must be at most ${def.maxLength} characters.`);
      } else if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
        errors.push(`${key} cannot contain control characters.`);
      }
    } else if (def.kind === 'enum') {
      if (!def.enumValues?.includes(value as string)) {
        errors.push(`${key} must be one of: ${def.enumValues?.join(', ')}.`);
      }
    }
  }

  return errors;
}

export function getRevision(raw: RawSettings): number {
  return Math.max(1, Math.trunc(Number(raw['system.config_revision'] ?? '1')) || 1);
}

/** Loads stored values; gracefully falls back to defaults when the table is missing. */
export async function loadRawSettings(): Promise<RawSettings> {
  const raw: RawSettings = {};
  const { data, error } = await serviceSupabase.from('system_settings').select('*');

  if (!error && data) {
    for (const row of data) {
      raw[String(row.key)] = String(row.value);
      if (String(row.key) === 'system.config_revision') {
        raw['system.config_revision_updated_at'] = String(row.updated_at ?? '');
        raw['system.config_revision_updated_by'] = row.updated_by != null ? String(row.updated_by) : '';
      }
    }
  } else if (error && !error.message.includes('system_settings') && error.code !== '42P01') {
    throw new Error(error.message);
  }

  return raw;
}

export interface BacLimitSetting {
  key: BacCategoryKey;
  label: string;
  limitG100ml: number;
  limitMg1000ml: number;
}

export interface AdminConfig {
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
  auth: { sessionTimeoutMinutes: number };
  export: {
    pdfWatermarkEnabled: boolean;
    pdfWatermarkText: string;
    pdfAccess: PdfAccessPolicy;
  };
  alerts: {
    integrityFlagCount: number;
    failureRateChangePoints: number;
    roadblockMinimumTests: number;
    avgFailingBacMultiple: number;
  };
  bacLimits: BacLimitSetting[];
}

export type RuntimeConfig = Omit<AdminConfig, 'revision' | 'updatedAt' | 'updatedBy'>;

function resolveString(raw: RawSettings, key: string): string {
  return raw[key] !== undefined ? String(raw[key]) : String(SETTING_REGISTRY[key].default);
}

function resolveNumber(raw: RawSettings, key: string): number {
  const def = SETTING_REGISTRY[key];
  const parsed = raw[key] !== undefined ? parseSettingValue(key, raw[key]) : def.default;
  return Number(parsed);
}

function resolveBoolean(raw: RawSettings, key: string): boolean {
  const def = SETTING_REGISTRY[key];
  const parsed = raw[key] !== undefined ? parseSettingValue(key, raw[key]) : def.default;
  return parsed === true;
}

function resolveEnum<T extends string>(raw: RawSettings, key: string): T {
  const def = SETTING_REGISTRY[key];
  const parsed = raw[key] !== undefined ? parseSettingValue(key, raw[key]) : def.default;
  return parsed as T;
}

export function buildRuntimeConfig(raw: RawSettings): RuntimeConfig {
  return {
    auth: {
      sessionTimeoutMinutes: resolveNumber(raw, 'auth.session_timeout_minutes')
    },
    export: {
      pdfWatermarkEnabled: resolveBoolean(raw, 'export.pdf_watermark_enabled'),
      pdfWatermarkText: resolveString(raw, 'export.pdf_watermark_text'),
      pdfAccess: resolveEnum<PdfAccessPolicy>(raw, 'export.pdf_access')
    },
    alerts: {
      integrityFlagCount: resolveNumber(raw, 'alerts.integrity_flag_count'),
      failureRateChangePoints: resolveNumber(raw, 'alerts.failure_rate_change_points'),
      roadblockMinimumTests: resolveNumber(raw, 'alerts.roadblock_minimum_tests'),
      avgFailingBacMultiple: resolveNumber(raw, 'alerts.avg_failing_bac_multiple')
    },
    bacLimits: BAC_CATEGORY_KEYS.map((key) => ({
      key,
      label: key === 'professional' ? 'Professional Driver' : 'General Driver',
      limitG100ml: resolveNumber(raw, `bac.${key}.limit_g100ml`),
      limitMg1000ml: resolveNumber(raw, `bac.${key}.limit_mg1000ml`)
    }))
  };
}

export function buildAdminConfig(raw: RawSettings): AdminConfig {
  const revision = getRevision(raw);
  const storedAt = raw['system.config_revision_updated_at'];
  const storedBy = raw['system.config_revision_updated_by'];
  return {
    ...buildRuntimeConfig(raw),
    revision,
    updatedAt: storedAt && !Number.isNaN(new Date(storedAt).getTime()) ? storedAt : new Date().toISOString(),
    updatedBy: storedBy ? storedBy : null
  };
}

export async function getAdminConfig(): Promise<AdminConfig> {
  return buildAdminConfig(await loadRawSettings());
}

export async function getRuntimeConfigService(): Promise<RuntimeConfig> {
  return buildRuntimeConfig(await loadRawSettings());
}

/** Persists validated changes and returns the canonical saved configuration. */
export async function updateAdminSettings(
  actorEmail: string,
  expectedRevision: number,
  values: Record<string, unknown>
): Promise<AdminConfig> {
  const errors = validateSettingUpdate(values);
  if (errors.length > 0) {
    throw new SettingsValidationError(errors.join(' '));
  }

  const raw = await loadRawSettings();
  const current = getRevision(raw);
  if (expectedRevision !== current) {
    throw new SettingsConflictError(current);
  }

  const now = new Date().toISOString();
  const rows = Object.entries(values).map(([key, value]) => ({
    key,
    value: serializeSettingValue(key, value),
    updated_at: now,
    updated_by: actorEmail
  }));
  rows.push({
    key: 'system.config_revision',
    value: String(current + 1),
    updated_at: now,
    updated_by: actorEmail
  });

  const { error } = await serviceSupabase.from('system_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog(
    actorEmail,
    `Updated settings: ${Object.keys(values).sort().join(', ')}`,
    `config revision ${current + 1}`
  );

  const updatedRaw: RawSettings = { ...raw };
  for (const row of rows) {
    updatedRaw[row.key] = row.value;
  }
  updatedRaw['system.config_revision_updated_at'] = now;
  updatedRaw['system.config_revision_updated_by'] = actorEmail;

  return buildAdminConfig(updatedRaw);
}
