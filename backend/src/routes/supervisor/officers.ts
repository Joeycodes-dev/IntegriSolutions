import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ROLE_OFFICER } from '../../constants/roles';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';
import {
  buildOfficerInviteLink,
  generateOfficerInviteToken,
  hashOfficerInviteToken,
  officerInviteExpiresAt
} from '../../utilities/officerInvites';

const router = Router();

type DbError = { message?: string; code?: string; details?: string; hint?: string };

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

function digitsOnly(value?: string): string {
  return value?.replace(/\D/g, '') ?? '';
}

async function allocateOfficerIdNumber(
  phone?: string,
  serviceNumber?: string,
  idNumber?: string
): Promise<number> {
  const candidates: number[] = [];

  for (const raw of [idNumber, phone, serviceNumber]) {
    const digits = digitsOnly(raw);
    if (digits.length >= 6) {
      const n = Number(digits.slice(-13));
      if (Number.isFinite(n) && n > 0) candidates.push(n);
    }
  }

  for (const candidate of candidates) {
    const { data } = await serviceSupabase
      .from('officer_users')
      .select('officer_id')
      .eq('officer_id_number', candidate)
      .limit(1);

    if (!data?.length) return candidate;
  }

  return 100_000_000 + Math.floor(Math.random() * 900_000_000);
}

function formatDbError(error: DbError | null): string {
  if (!error) return 'Database operation failed';
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return parts.join(' — ') || 'Database operation failed';
}

async function safeDeleteOfficer(officerId: number): Promise<void> {
  try {
    await serviceSupabase.from('officer_users').delete().eq('officer_id', officerId);
  } catch (err) {
    console.error('[supervisor/officers] officer cleanup failed:', err);
  }
}

function toFieldOfficer(row: Record<string, unknown>) {
  const officerId = Number(row.officer_id);
  return {
    officerId,
    userId: `usr_officer_${String(officerId).padStart(2, '0')}`,
    name: `${row.officer_name} ${row.officer_surname}`.trim(),
    firstName: String(row.officer_name),
    surname: String(row.officer_surname),
    email: String(row.officer_email_address),
    serviceNumber: String(row.badge_number),
    rank: String(row.province || 'Constable'),
    station: String(row.region || row.province || '—'),
    status: String(row.officer_employment_status || 'Active'),
    createdAt: String(row.created_at ?? '')
  };
}

router.use(requireSupervisor);

router.get('/', async (_req, res) => {
  const { data, error } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('role_id', ROLE_OFFICER)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json((data ?? []).map((row) => toFieldOfficer(row as Record<string, unknown>)));
});

router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email = String(body.email ?? '');
  const name = String(body.name ?? '');
  const surname = String(body.surname ?? '');
  const serviceNumber = String(body.serviceNumber ?? '');
  const rank = String(body.rank ?? 'Constable');
  const station = String(body.station ?? '');
  const phone = String(body.phone ?? '');
  const idNumber = body.idNumber != null ? String(body.idNumber) : undefined;

  if (!email || !name || !surname || !serviceNumber) {
    return res.status(400).json({
      error: 'Email, name, surname, and service number are required'
    });
  }

  const { data: existing } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('officer_email_address', email)
    .limit(1);

  if (existing?.length) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const officerIdNumber = await allocateOfficerIdNumber(phone, serviceNumber, idNumber);

  const { data: inserted, error: insertError } = await serviceSupabase
    .from('officer_users')
    .insert([
      {
        officer_email_address: email,
        officer_name: name,
        officer_surname: surname,
        officer_id_number: officerIdNumber,
        badge_number: serviceNumber.trim(),
        officer_employment_status: 'Invited',
        province: rank.trim(),
        region: station.trim(),
        officer_type_id: 1,
        role_id: ROLE_OFFICER
      }
    ])
    .select('*');

  if (insertError || !inserted?.length) {
    return res.status(500).json({ error: formatDbError(insertError as DbError | null) });
  }

  const created = toFieldOfficer(inserted[0] as Record<string, unknown>);
  const token = generateOfficerInviteToken();
  const expiresAt = officerInviteExpiresAt();
  const { error: inviteError } = await serviceSupabase.from('officer_invitations').insert([{
    officer_id: created.officerId,
    token_hash: hashOfficerInviteToken(token),
    created_by_email: authReq.userEmail ?? null,
    expires_at: expiresAt
  }]);

  if (inviteError) {
    await safeDeleteOfficer(created.officerId);
    return res.status(500).json({ error: formatDbError(inviteError as DbError | null) });
  }

  const createdWithInvite = {
    ...created,
    inviteLink: buildOfficerInviteLink(token),
    invitationExpiresAt: expiresAt
  };

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    'Created field officer invite',
    created.userId
  );

  return res.status(201).json(createdWithInvite);
}));

export default router;
