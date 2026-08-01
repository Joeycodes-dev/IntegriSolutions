import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ROLE_OFFICER } from '../../constants/roles';
import { normalizeDutyStatus } from '../../constants/dutyStatus';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';
import {
  buildOfficerInviteLink,
  generateOfficerInviteToken,
  hashOfficerInviteToken,
  officerInviteExpiresAt
} from '../../utilities/officerInvites';
import { sendOfficerInviteEmail } from '../../utilities/email';

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
    dutyStatus: normalizeDutyStatus(row.duty_status),
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
  const email = String(body.email ?? '').trim().toLowerCase();
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

  const { data: existingSupervisors } = await serviceSupabase
    .from('supervisor_users')
    .select('supervisor_id')
    .eq('supervisor_email_address', email)
    .limit(1);

  if (existingSupervisors?.length) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existingAuth) {
    return res.status(409).json({ error: 'An auth account with this email already exists' });
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

  let inviteLink: string | undefined;
  let inviteEmailSent = false;
  let emailWarning: string | undefined;

  const { error: inviteError } = await serviceSupabase.from('officer_invitations').insert([{
    officer_id: created.officerId,
    token_hash: hashOfficerInviteToken(token),
    created_by_email: authReq.userEmail ?? null,
    expires_at: expiresAt
  }]);

  if (inviteError) {
    console.warn('[supervisor/officers] invite table insert failed (table may not exist yet):', inviteError.message);
    emailWarning = 'Invite link unavailable — officer_invitations table not set up yet. Officer was still created.';
  } else {
    inviteLink = buildOfficerInviteLink(token);

    try {
      await sendOfficerInviteEmail({
        to: email,
        officerName: `${name} ${surname}`.trim(),
        inviteLink,
        expiresAt
      });
      inviteEmailSent = true;
    } catch (error) {
      emailWarning =
        error instanceof Error ? error.message : 'Failed to send officer invite email';
      console.warn('[supervisor/officers] invite email failed, returning link:', emailWarning);
    }
  }

  const createdWithInvite = {
    ...created,
    invitationExpiresAt: expiresAt,
    inviteEmailSent,
    ...(inviteLink ? { inviteLink } : {}),
    ...(emailWarning ? { emailWarning } : {})
  };

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    inviteEmailSent
      ? 'Created field officer invite'
      : 'Created field officer invite (email not sent)',
    created.userId
  );

  return res.status(201).json(createdWithInvite);
}));

const OFFICER_STATUSES = ['Active', 'Inactive', 'Invited', 'Suspended'] as const;

router.patch('/:officerId', asyncHandler(async (req, res) => {
  const authReq = req as unknown as SupervisorRequest;
  const officerId = Number(req.params.officerId);
  const body = (req.body ?? {}) as {
    status?: string;
    rank?: string;
    station?: string;
  };

  if (!Number.isFinite(officerId)) {
    return res.status(400).json({ error: 'Invalid officer id' });
  }

  const status = body.status?.trim();
  const rank = body.rank?.trim();
  const station = body.station?.trim();

  if (!status && rank === undefined && station === undefined) {
    return res.status(400).json({ error: 'Provide status, rank, and/or station to update' });
  }

  if (status && !(OFFICER_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({
      error: `Status must be one of: ${OFFICER_STATUSES.join(', ')}`
    });
  }

  const { data: existingRows, error: fetchError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_id', officerId)
    .eq('role_id', ROLE_OFFICER)
    .limit(1);

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (!existing) {
    return res.status(404).json({ error: 'Field officer not found' });
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.officer_employment_status = status;
  if (rank !== undefined) patch.province = rank;
  if (station !== undefined) patch.region = station;

  const { data: updatedRows, error: updateError } = await serviceSupabase
    .from('officer_users')
    .update(patch)
    .eq('officer_id', officerId)
    .eq('role_id', ROLE_OFFICER)
    .select('*')
    .limit(1);

  if (updateError || !updatedRows?.length) {
    return res.status(500).json({
      error: formatDbError(updateError as DbError | null)
    });
  }

  const updated = toFieldOfficer(updatedRows[0] as Record<string, unknown>);

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    `Updated field officer (${Object.keys(patch).join(', ')})`,
    updated.userId
  );

  return res.json(updated);
}));

export default router;
