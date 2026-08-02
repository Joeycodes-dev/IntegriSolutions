import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import { getAdminConfig, updateAdminConfig } from '../../services/api';
import type { AdminConfig, BacLimitSetting, PdfAccessPolicy } from '../../types';

const NAVY = '#0D2137';
const PAGE_BG = '#F1F5F9';
const BORDER = '#E2E8F0';
const INPUT_CLASS =
  'h-[34px] w-full rounded-md border bg-white px-3 text-[0.8125rem] text-slate-800 outline-none transition focus:border-[#0D2137]/35 focus:ring-1 focus:ring-[#0D2137]/10 disabled:opacity-50';
const SELECT_CLASS = `${INPUT_CLASS} appearance-none pr-8`;

interface FormState {
  sessionTimeoutMinutes: string;
  pdfWatermarkEnabled: boolean;
  pdfWatermarkText: string;
  pdfAccess: PdfAccessPolicy;
  integrityFlagCount: string;
  failureRateChangePoints: string;
  roadblockMinimumTests: string;
  avgFailingBacMultiple: string;
  bacLimits: Array<Pick<BacLimitSetting, 'key' | 'label'> & { limitG100ml: string; limitMg1000ml: string }>;
}

function fromConfig(config: AdminConfig): FormState {
  return {
    sessionTimeoutMinutes: String(config.auth.sessionTimeoutMinutes),
    pdfWatermarkEnabled: config.export.pdfWatermarkEnabled,
    pdfWatermarkText: config.export.pdfWatermarkText,
    pdfAccess: config.export.pdfAccess,
    integrityFlagCount: String(config.alerts.integrityFlagCount),
    failureRateChangePoints: String(config.alerts.failureRateChangePoints),
    roadblockMinimumTests: String(config.alerts.roadblockMinimumTests),
    avgFailingBacMultiple: String(config.alerts.avgFailingBacMultiple),
    bacLimits: config.bacLimits.map((limit) => ({
      key: limit.key,
      label: limit.label,
      limitG100ml: String(limit.limitG100ml),
      limitMg1000ml: String(limit.limitMg1000ml)
    }))
  };
}

function validateForm(form: FormState): string[] {
  const errors: string[] = [];
  const numberChecks: Array<[string, string, number, number]> = [
    ['Session timeout (minutes)', form.sessionTimeoutMinutes, 5, 1440],
    ['Integrity flag threshold', form.integrityFlagCount, 0, 1000000],
    ['Failure-rate change (points)', form.failureRateChangePoints, 0, 100],
    ['Minimum roadblock tests', form.roadblockMinimumTests, 1, 1000000],
    ['Average failing BAC multiple', form.avgFailingBacMultiple, 0.1, 100]
  ];
  for (const [label, raw, min, max] of numberChecks) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      errors.push(`${label} must be between ${min} and ${max}.`);
    }
  }
  for (const limit of form.bacLimits) {
    for (const [label, raw] of [
      [`${limit.label} blood limit (g/100ml)`, limit.limitG100ml],
      [`${limit.label} breath limit (mg/1000ml)`, limit.limitMg1000ml]
    ] as Array<[string, string]>) {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`${label} must be a positive number.`);
      }
    }
  }
  if (!form.pdfWatermarkText.trim()) {
    errors.push('Watermark text cannot be empty when the watermark is enabled.');
  }
  if (form.pdfWatermarkText.length > 120) {
    errors.push('Watermark text must be at most 120 characters.');
  }
  return errors;
}

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[0.6875rem] leading-snug text-slate-400">{hint}</span>}
    </label>
  );
}

function Card({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white px-5 py-4" style={{ borderColor: BORDER }}>
      <h2 className="text-[0.8125rem] font-bold" style={{ color: NAVY }}>
        {title}
      </h2>
      <p className="mt-0.5 text-[0.6875rem] text-slate-400">{subtitle}</p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SystemConfiguration() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminConfig();
      setConfig(data);
      setForm(fromConfig(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system configuration');
      setConfig(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const dirty = useMemo(() => {
    if (!config || !form) return false;
    return JSON.stringify(fromConfig(config)) !== JSON.stringify(form);
  }, [config, form]);

  const validationErrors = useMemo(() => (form ? validateForm(form) : []), [form]);

  const setValue = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setBacLimit = (key: string, field: 'limitG100ml' | 'limitMg1000ml', value: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            bacLimits: prev.bacLimits.map((limit) =>
              limit.key === key ? { ...limit, [field]: value } : limit
            )
          }
        : prev
    );
  };

  const handleSave = async () => {
    if (!config || !form) return;
    if (validationErrors.length > 0) return;

    if (
      form.pdfAccess === 'disabled' &&
      config.export.pdfAccess !== 'disabled' &&
      !window.confirm(
        'Disabling PDF export prevents supervisors from generating court PDFs. Continue?'
      )
    ) {
      return;
    }

    const values: Record<string, unknown> = {
      'auth.session_timeout_minutes': Number(form.sessionTimeoutMinutes),
      'export.pdf_watermark_enabled': form.pdfWatermarkEnabled,
      'export.pdf_watermark_text': form.pdfWatermarkText.trim(),
      'export.pdf_access': form.pdfAccess,
      'alerts.integrity_flag_count': Number(form.integrityFlagCount),
      'alerts.failure_rate_change_points': Number(form.failureRateChangePoints),
      'alerts.roadblock_minimum_tests': Number(form.roadblockMinimumTests),
      'alerts.avg_failing_bac_multiple': Number(form.avgFailingBacMultiple)
    };
    for (const limit of form.bacLimits) {
      values[`bac.${limit.key}.limit_g100ml`] = Number(limit.limitG100ml);
      values[`bac.${limit.key}.limit_mg1000ml`] = Number(limit.limitMg1000ml);
    }

    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const updated = await updateAdminConfig(config.revision, values);
      setConfig(updated);
      setForm(fromConfig(updated));
      setSavedAt(`Saved at ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      if (/updated by another administrator/i.test(message)) {
        try {
          const updated = await getAdminConfig();
          setConfig(updated);
          setForm(fromConfig(updated));
        } catch {
          // keep current state if the reload also fails
        }
        setError(`${message} The latest configuration has been loaded.`);
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (config) setForm(fromConfig(config));
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ backgroundColor: PAGE_BG }}>
      <header className="flex flex-wrap items-start justify-between gap-4 px-8 pb-4 pt-8">
        <div>
          <h1 className="text-lg font-bold leading-tight" style={{ color: NAVY }}>
            System Configuration
          </h1>
          <p className="mt-1 text-[0.8125rem] text-slate-500">
            Editable global admin controls. Changes apply to future behaviour and are audited.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {config && (
            <span className="text-[0.6875rem] text-slate-400">
              Revision {config.revision}
              {config.updatedBy ? ` · last changed by ${config.updatedBy}` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => void loadSettings()}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50"
            style={{ borderColor: BORDER }}
          >
            <RefreshCw size={13} strokeWidth={2} />
            Reload
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.75rem] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            style={{ borderColor: BORDER }}
          >
            <RotateCcw size={13} strokeWidth={2} />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving || validationErrors.length > 0}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[0.75rem] font-bold text-white transition hover:brightness-110 disabled:opacity-40"
            style={{ backgroundColor: NAVY }}
          >
            <Save size={13} strokeWidth={2} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-8 pb-8">
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.8125rem] text-amber-900">
            {error}
          </div>
        )}
        {savedAt && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.8125rem] text-emerald-800">
            {savedAt}
          </div>
        )}
        {validationErrors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[0.8125rem] text-rose-800">
            {validationErrors.join(' ')}
          </div>
        )}

        {loading && <p className="text-[0.8125rem] text-slate-500">Loading configuration…</p>}

        {!loading && !form && !error && (
          <p className="text-[0.8125rem] text-slate-500">No configuration data available.</p>
        )}

        {!loading && form && (
          <>
            <Card
              title="Authentication"
              subtitle="Applies to the web portal only. Idle users are signed out after this period."
            >
              <Field label="Session timeout (minutes)" hint="5–1,440 minutes of inactivity.">
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={form.sessionTimeoutMinutes}
                  onChange={(e) => setValue('sessionTimeoutMinutes', e.target.value)}
                  aria-label="Session timeout (minutes)"
                  className={INPUT_CLASS}
                />
              </Field>
            </Card>

            <Card
              title="Export Governance"
              subtitle="Controls court PDF generation and watermarking."
            >
              <Field label="PDF export access">
                <select
                  value={form.pdfAccess}
                  onChange={(e) => setValue('pdfAccess', e.target.value as PdfAccessPolicy)}
                  aria-label="PDF export access"
                  className={SELECT_CLASS}
                >
                  <option value="admin_supervisor">Admins and supervisors</option>
                  <option value="admin_only">Admins only</option>
                  <option value="disabled">Disabled</option>
                </select>
              </Field>
              <Field label="Export watermark">
                <div className="flex h-[34px] items-center gap-2 rounded-md border px-3" style={{ borderColor: BORDER }}>
                  <input
                    type="checkbox"
                    checked={form.pdfWatermarkEnabled}
                    onChange={(e) => setValue('pdfWatermarkEnabled', e.target.checked)}
                    aria-label="Export watermark"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-[0.8125rem] text-slate-700">Enabled</span>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Watermark text" hint="Maximum 120 characters. Applied diagonally to every PDF page.">
                  <input
                    type="text"
                    maxLength={120}
                    value={form.pdfWatermarkText}
                    onChange={(e) => setValue('pdfWatermarkText', e.target.value)}
                    disabled={!form.pdfWatermarkEnabled}
                    aria-label="Watermark text"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>
            </Card>

            <Card
              title="Alert Thresholds"
              subtitle="Drive the supervisor dashboard and report insights."
            >
              <Field label="Integrity flag count" hint="Minimum hash mismatches to raise a critical alert.">
                <input
                  type="number"
                  min={0}
                  value={form.integrityFlagCount}
                  onChange={(e) => setValue('integrityFlagCount', e.target.value)}
                  aria-label="Integrity flag count"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Failure-rate change (points)" hint="Minimum change vs the previous period.">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={form.failureRateChangePoints}
                  onChange={(e) => setValue('failureRateChangePoints', e.target.value)}
                  aria-label="Failure-rate change (points)"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Minimum roadblock tests" hint="Roadblock volume needed to flag a hotspot.">
                <input
                  type="number"
                  min={1}
                  value={form.roadblockMinimumTests}
                  onChange={(e) => setValue('roadblockMinimumTests', e.target.value)}
                  aria-label="Minimum roadblock tests"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Average failing BAC multiple" hint="Multiples of the general limit before a critical alert.">
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.avgFailingBacMultiple}
                  onChange={(e) => setValue('avgFailingBacMultiple', e.target.value)}
                  aria-label="Average failing BAC multiple"
                  className={INPUT_CLASS}
                />
              </Field>
            </Card>

            <Card
              title="BAC Limits by Driver Category"
              subtitle="Blood (g/100ml) and breath (mg/1000ml) limits. Category is derived from the licence at capture time; changes apply to future captures only."
            >
              {form.bacLimits.map((limit) => (
                <div key={limit.key} className="rounded-lg border p-3" style={{ borderColor: BORDER }}>
                  <p className="mb-2 text-[0.75rem] font-bold text-slate-700">{limit.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Blood g/100ml">
                      <input
                        type="number"
                        min={0}
                        step={0.005}
                        value={limit.limitG100ml}
                        onChange={(e) => setBacLimit(limit.key, 'limitG100ml', e.target.value)}
                        aria-label={`${limit.label} blood limit (g/100ml)`}
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field label="Breath mg/1000ml">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={limit.limitMg1000ml}
                        onChange={(e) => setBacLimit(limit.key, 'limitMg1000ml', e.target.value)}
                        aria-label={`${limit.label} breath limit (mg/1000ml)`}
                        className={INPUT_CLASS}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
