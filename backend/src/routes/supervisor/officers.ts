import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ROLE_OFFICER } from '../../constants/roles';
import { requireSupervisor, type SupervisorRequest } from '../../middleware/requireSupervisor';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';

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

async function removeOrphanAuthUser(email: string): Promise<boolean> {
  try {
    const { data: officers } = await serviceSupabase
      .from('officer_users')
      .select('officer_id')
      .eq('officer_email_address', email)
      .limit(1);

    if (officers?.length) return false;

    const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authList?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!authUser) return false;

    const { error } = await serviceSupabase.auth.admin.deleteUser(authUser.id);
    return !error;
  } catch {
    return false;
  }
}

async function safeDeleteAuthUser(userId: string): Promise<void> {
  try {
    await serviceSupabase.auth.admin.deleteUser(userId);
  } catch (err) {
    console.error('[supervisor/officers] auth cleanup failed:', err);
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
  const password = String(body.password ?? '');
  const name = String(body.name ?? '');
  const surname = String(body.surname ?? '');
  const serviceNumber = String(body.serviceNumber ?? '');
  const rank = String(body.rank ?? 'Constable');
  const station = String(body.station ?? '');
  const phone = String(body.phone ?? '');
  const idNumber = body.idNumber != null ? String(body.idNumber) : undefined;

  if (!email || !password || !name || !surname || !serviceNumber) {
    return res.status(400).json({
      error: 'Email, password, name, surname, and service number are required'
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

  await removeOrphanAuthUser(email);

  let authData = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authData.error?.message?.toLowerCase().includes('already')) {
    const cleaned = await removeOrphanAuthUser(email);
    if (cleaned) {
      authData = await serviceSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
    }
  }

  const { data: authUserData, error: authError } = authData;

  if (authError || !authUserData.user) {
    const msg = authError?.message ?? 'Failed to create auth account';
    const status = msg.toLowerCase().includes('already') ? 409 : 400;
    return res.status(status).json({ error: msg });
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
        officer_employment_status: 'Active',
        province: rank.trim(),
        region: station.trim(),
        officer_type_id: 1,
        role_id: ROLE_OFFICER
      }
    ])
    .select('*');

  if (insertError || !inserted?.length) {
    await safeDeleteAuthUser(authUserData.user.id);
    return res.status(500).json({ error: formatDbError(insertError as DbError | null) });
  }

  const created = toFieldOfficer(inserted[0] as Record<string, unknown>);

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    'Created field officer account',
    created.userId
  );

  return res.status(201).json(created);
}));

export default router;
