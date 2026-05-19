import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '../../middleware/requireAdmin';

const router = Router();

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

interface ConfigCard {
  id: string;
  title: string;
  lines: string[];
}

function defaultSettingsMap(): Record<string, string> {
  return {
    'auth.mfa_policy': 'Required for Supervisor and Admin roles.',
    'auth.session_timeout': process.env.SESSION_TIMEOUT_LABEL ?? '30 minutes inactive.',
    'retention.evidence_days': process.env.EVIDENCE_RETENTION_DAYS
      ? `${process.env.EVIDENCE_RETENTION_DAYS} days.`
      : '90 days.',
    'retention.audit_days': process.env.AUDIT_RETENTION_DAYS
      ? `${process.env.AUDIT_RETENTION_DAYS} days.`
      : '365 days.',
    'export.pdf_watermark': process.env.PDF_WATERMARK_ENABLED === 'false' ? 'Disabled.' : 'Enabled.',
    'export.excel_access': process.env.EXCEL_EXPORT_ACCESS ?? 'Admin only.',
    'environment.mode': process.env.APP_MODE ?? 'IntegriScan',
    'environment.region': process.env.APP_REGION ?? 'ZA-JHB-01'
  };
}

function buildCards(settings: Record<string, string>): ConfigCard[] {
  return [
    {
      id: 'authentication',
      title: 'Authentication Policy',
      lines: [
        `MFA: ${settings['auth.mfa_policy']}`,
        `Session timeout: ${settings['auth.session_timeout']}`
      ]
    },
    {
      id: 'retention',
      title: 'Data Retention',
      lines: [
        `Evidence retention: ${settings['retention.evidence_days']}`,
        `Audit retention: ${settings['retention.audit_days']}`
      ]
    },
    {
      id: 'export',
      title: 'Export Controls',
      lines: [
        `PDF export watermark: ${settings['export.pdf_watermark']}`,
        `Excel export access: ${settings['export.excel_access']}`
      ]
    },
    {
      id: 'environment',
      title: 'Environment',
      lines: [
        `Mode: ${settings['environment.mode']}`,
        `Region: ${settings['environment.region']}`
      ]
    }
  ];
}

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const settings = defaultSettingsMap();

  const { data, error } = await serviceSupabase.from('system_settings').select('key, value');

  if (!error && data) {
    for (const row of data) {
      settings[String(row.key)] = String(row.value);
    }
  } else if (error && !error.message.includes('system_settings') && error.code !== '42P01') {
    return res.status(500).json({ error: error.message });
  }

  return res.json({ cards: buildCards(settings) });
});

export default router;
