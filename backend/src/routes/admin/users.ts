import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, type AdminRequest } from '../../middleware/requireAdmin';
import { PORTAL_ROLES, ROLE_ADMIN, ROLE_SUPERVISOR, portalUserId, roleLabel } from '../../constants/roles';
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

/** Picks a numeric ID that is unlikely to collide with existing officer_users rows. */
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

  for (let attempt = 0; attempt < 8; attempt++) {
    const fallback = 100_000_000 + Math.floor(Math.random() * 900_000_000);
    const { data } = await serviceSupabase
      .from('officer_users')
      .select('officer_id')
      .eq('officer_id_number', fallback)
      .limit(1);

    if (!data?.length) return fallback;
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
    console.error('[admin/users] auth cleanup failed:', err);
  }
}

function toPortalUser(row: Record<string, unknown>) {
  const officerId = Number(row.officer_id);
  const roleId = Number(row.role_id);
  return {
    officerId,
    userId: portalUserId(officerId, roleId),
    name: `${row.officer_name} ${row.officer_surname}`.trim(),
    email: String(row.officer_email_address),
    role: roleLabel(roleId),
    roleId,
    station: String(row.region || row.province || '—'),
    status: String(row.officer_employment_status || 'Active'),
    createdAt: String(row.created_at ?? '')
  };
}

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const { data, error } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .in('role_id', PORTAL_ROLES)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json((data ?? []).map((row) => toPortalUser(row as Record<string, unknown>)));
});

router.post('/', asyncHandler(async (req, res) => {
  const authReq = req as unknown as AdminRequest;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const {
    email,
    password,
    name,
    surname,
    roleId,
    station,
    status,
    serviceNumber,
    rank,
    phone,
    idNumber
  } = body as {
    email?: string;
    password?: string;
    name?: string;
    surname?: string;
    roleId?: number;
    station?: string;
    status?: string;
    serviceNumber?: string;
    rank?: string;
    phone?: string;
    idNumber?: string;
  };

  if (!email || !password || !name || !surname) {
    return res.status(400).json({
      error:
        Object.keys(body).length === 0
          ? 'Request body is missing. Send JSON with Content-Type: application/json.'
          : 'Email, password, name, and surname are required'
    });
  }

  const resolvedRoleId = Number(roleId);
  if (resolvedRoleId !== ROLE_SUPERVISOR && resolvedRoleId !== ROLE_ADMIN) {
    return res.status(400).json({ error: 'Role must be Supervisor or Admin' });
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
    .insert([{
      officer_email_address: email,
      officer_name: name,
      officer_surname: surname,
      officer_id_number: officerIdNumber,
      badge_number:
        serviceNumber?.trim() ||
        (resolvedRoleId === ROLE_ADMIN ? 'ADM' : 'SUP'),
      officer_employment_status: status ?? 'Active',
      province: rank?.trim() || '',
      region: station ?? '',
      officer_type_id: 1,
      role_id: resolvedRoleId
    }])
    .select('*');

  if (insertError || !inserted?.length) {
    await safeDeleteAuthUser(authUserData.user.id);
    console.error('[admin/users] profile insert failed:', insertError);
    return res.status(500).json({
      error: formatDbError(insertError as DbError | null),
      code: (insertError as DbError | null)?.code
    });
  }

  const row = inserted[0] as Record<string, unknown>;
  const created = toPortalUser(row);

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    resolvedRoleId === ROLE_SUPERVISOR ? 'Created supervisor account' : 'Created admin account',
    created.userId
  );

  return res.status(201).json(created);
}));

router.delete('/:officerId', async (req, res) => {
  const authReq = req as unknown as AdminRequest;
  const officerId = Number(req.params.officerId);

  if (!Number.isFinite(officerId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (officerId === authReq.adminOfficerId) {
    return res.status(400).json({ error: 'You cannot remove your own account' });
  }

  const { data: targetRows, error: fetchError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_id', officerId)
    .in('role_id', PORTAL_ROLES)
    .limit(1);

  if (fetchError) {
    return res.status(500).json({ error: fetchError.message });
  }

  const target = Array.isArray(targetRows) ? targetRows[0] : null;
  if (!target) {
    return res.status(404).json({ error: 'User not found' });
  }

  const email = String(target.officer_email_address);
  const removedUserId = portalUserId(officerId, Number(target.role_id));

  const { error: deleteError } = await serviceSupabase
    .from('officer_users')
    .delete()
    .eq('officer_id', officerId);

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  try {
    const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (authUser) {
      await serviceSupabase.auth.admin.deleteUser(authUser.id);
    }
  } catch {
    // Profile removed; auth cleanup is best-effort
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    'Removed portal user',
    removedUserId
  );

  return res.json({ removed: officerId });
});

export default router;
