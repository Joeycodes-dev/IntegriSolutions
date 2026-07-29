import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin, type AdminRequest } from '../../middleware/requireAdmin';
import {
  PORTAL_ROLES,
  ROLE_ADMIN,
  ROLE_SUPERVISOR,
  portalUserId,
  roleLabel
} from '../../constants/roles';
import { writeAuditLog } from '../../utilities/auditLog';
import { asyncHandler } from '../../asyncHandler';

const router = Router();

type DbError = { message?: string; code?: string; details?: string; hint?: string };
type PortalSource = 'officer_users' | 'supervisor_users';

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

async function allocateIdNumber(
  table: 'officer_users' | 'supervisor_users',
  idColumn: 'officer_id_number' | 'supervisor_id_number',
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
    const { data } = await serviceSupabase.from(table).select(idColumn).eq(idColumn, candidate).limit(1);
    if (!data?.length) return candidate;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const fallback = 100_000_000 + Math.floor(Math.random() * 900_000_000);
    const { data } = await serviceSupabase.from(table).select(idColumn).eq(idColumn, fallback).limit(1);
    if (!data?.length) return fallback;
  }

  return 100_000_000 + Math.floor(Math.random() * 900_000_000);
}

function formatDbError(error: DbError | null): string {
  if (!error) return 'Database operation failed';
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  return parts.join(' — ') || 'Database operation failed';
}

async function emailTaken(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const [{ data: officers }, { data: supervisors }] = await Promise.all([
    serviceSupabase
      .from('officer_users')
      .select('officer_id')
      .eq('officer_email_address', normalized)
      .limit(1),
    serviceSupabase
      .from('supervisor_users')
      .select('supervisor_id')
      .eq('supervisor_email_address', normalized)
      .limit(1)
  ]);
  return Boolean(officers?.length || supervisors?.length);
}

async function removeOrphanAuthUser(email: string): Promise<boolean> {
  try {
    if (await emailTaken(email)) return false;

    const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
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

function toPortalUserFromOfficer(row: Record<string, unknown>) {
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
    createdAt: String(row.created_at ?? ''),
    source: 'officer_users' as const
  };
}

function toPortalUserFromSupervisor(row: Record<string, unknown>) {
  const supervisorId = Number(row.supervisor_id);
  const roleId = Number(row.role_id) || ROLE_SUPERVISOR;
  return {
    officerId: supervisorId,
    userId: portalUserId(supervisorId, roleId),
    name: `${row.supervisor_name} ${row.supervisor_surname}`.trim(),
    email: String(row.supervisor_email_address),
    role: roleLabel(roleId),
    roleId,
    station: String(row.region || row.province || '—'),
    status: String(row.employment_status || 'Active'),
    createdAt: String(row.created_at ?? ''),
    source: 'supervisor_users' as const
  };
}

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const [adminsResult, supervisorsResult] = await Promise.all([
    serviceSupabase
      .from('officer_users')
      .select('*')
      .eq('role_id', ROLE_ADMIN)
      .order('created_at', { ascending: false }),
    serviceSupabase
      .from('supervisor_users')
      .select('*')
      .eq('role_id', ROLE_SUPERVISOR)
      .order('created_at', { ascending: false })
  ]);

  if (adminsResult.error) {
    return res.status(500).json({ error: adminsResult.error.message });
  }
  if (supervisorsResult.error) {
    return res.status(500).json({ error: supervisorsResult.error.message });
  }

  // Also surface legacy supervisors that were incorrectly stored in officer_users.
  const { data: legacySupervisors, error: legacyError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('role_id', ROLE_SUPERVISOR)
    .order('created_at', { ascending: false });

  if (legacyError) {
    return res.status(500).json({ error: legacyError.message });
  }

  const users = [
    ...(adminsResult.data ?? []).map((row) => toPortalUserFromOfficer(row as Record<string, unknown>)),
    ...(supervisorsResult.data ?? []).map((row) =>
      toPortalUserFromSupervisor(row as Record<string, unknown>)
    ),
    ...(legacySupervisors ?? []).map((row) => toPortalUserFromOfficer(row as Record<string, unknown>))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return res.json(users);
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

  const normalizedEmail = email.trim().toLowerCase();

  if (await emailTaken(normalizedEmail)) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  await removeOrphanAuthUser(normalizedEmail);

  let authData = await serviceSupabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true
  });

  if (authData.error?.message?.toLowerCase().includes('already')) {
    const cleaned = await removeOrphanAuthUser(normalizedEmail);
    if (cleaned) {
      authData = await serviceSupabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true
      });
    }
  }

  const { data: authUserData, error: authError } = authData;

  if (authError || !authUserData.user) {
    const msg = authError?.message ?? 'Failed to create auth account';
    const statusCode = msg.toLowerCase().includes('already') ? 409 : 400;
    return res.status(statusCode).json({ error: msg });
  }

  let created:
    | ReturnType<typeof toPortalUserFromOfficer>
    | ReturnType<typeof toPortalUserFromSupervisor>;

  if (resolvedRoleId === ROLE_SUPERVISOR) {
    const supervisorIdNumber = await allocateIdNumber(
      'supervisor_users',
      'supervisor_id_number',
      phone,
      serviceNumber,
      idNumber
    );

    const { data: inserted, error: insertError } = await serviceSupabase
      .from('supervisor_users')
      .insert([
        {
          supervisor_email_address: normalizedEmail,
          supervisor_name: name,
          supervisor_surname: surname,
          supervisor_id_number: supervisorIdNumber,
          badge_number: serviceNumber?.trim() || 'SUP',
          employment_status: status ?? 'Active',
          province: rank?.trim() || '',
          region: station ?? '',
          officer_type_id: 1,
          role_id: ROLE_SUPERVISOR
        }
      ])
      .select('*');

    if (insertError || !inserted?.length) {
      await safeDeleteAuthUser(authUserData.user.id);
      console.error('[admin/users] supervisor insert failed:', insertError);
      return res.status(500).json({
        error: formatDbError(insertError as DbError | null),
        code: (insertError as DbError | null)?.code
      });
    }

    created = toPortalUserFromSupervisor(inserted[0] as Record<string, unknown>);
  } else {
    const officerIdNumber = await allocateIdNumber(
      'officer_users',
      'officer_id_number',
      phone,
      serviceNumber,
      idNumber
    );

    const { data: inserted, error: insertError } = await serviceSupabase
      .from('officer_users')
      .insert([
        {
          officer_email_address: normalizedEmail,
          officer_name: name,
          officer_surname: surname,
          officer_id_number: officerIdNumber,
          badge_number: serviceNumber?.trim() || 'ADM',
          officer_employment_status: status ?? 'Active',
          province: rank?.trim() || '',
          region: station ?? '',
          officer_type_id: 1,
          role_id: ROLE_ADMIN
        }
      ])
      .select('*');

    if (insertError || !inserted?.length) {
      await safeDeleteAuthUser(authUserData.user.id);
      console.error('[admin/users] admin insert failed:', insertError);
      return res.status(500).json({
        error: formatDbError(insertError as DbError | null),
        code: (insertError as DbError | null)?.code
      });
    }

    created = toPortalUserFromOfficer(inserted[0] as Record<string, unknown>);
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    resolvedRoleId === ROLE_SUPERVISOR ? 'Created supervisor account' : 'Created admin account',
    created.userId
  );

  return res.status(201).json(created);
}));

const PORTAL_STATUSES = ['Active', 'Inactive'] as const;

router.patch('/:officerId', asyncHandler(async (req, res) => {
  const authReq = req as unknown as AdminRequest;
  const officerId = Number(req.params.officerId);
  const sourceParam = String(req.query.source ?? '').trim() as PortalSource | '';
  const roleIdParam = Number(req.query.roleId);
  const body = (req.body ?? {}) as { status?: string; station?: string };

  if (!Number.isFinite(officerId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const status = body.status?.trim();
  const station = body.station?.trim();

  if (!status && station === undefined) {
    return res.status(400).json({ error: 'Provide status and/or station to update' });
  }

  if (status && !(PORTAL_STATUSES as readonly string[]).includes(status)) {
    return res.status(400).json({
      error: `Status must be one of: ${PORTAL_STATUSES.join(', ')}`
    });
  }

  if (
    status === 'Inactive' &&
    officerId === authReq.adminOfficerId &&
    (!sourceParam || sourceParam === 'officer_users')
  ) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const preferSupervisor =
    sourceParam === 'supervisor_users' ||
    (!sourceParam && roleIdParam === ROLE_SUPERVISOR);

  const updateSupervisor = async () => {
    const patch: Record<string, unknown> = {};
    if (status) patch.employment_status = status;
    if (station !== undefined) patch.region = station;

    const { data, error } = await serviceSupabase
      .from('supervisor_users')
      .update(patch)
      .eq('supervisor_id', officerId)
      .select('*')
      .limit(1);

    if (error) return { error: error.message };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { missing: true as const };
    return { user: toPortalUserFromSupervisor(row as Record<string, unknown>) };
  };

  const updateOfficerPortal = async () => {
    const patch: Record<string, unknown> = {};
    if (status) patch.officer_employment_status = status;
    if (station !== undefined) patch.region = station;

    const { data, error } = await serviceSupabase
      .from('officer_users')
      .update(patch)
      .eq('officer_id', officerId)
      .in('role_id', PORTAL_ROLES)
      .select('*')
      .limit(1);

    if (error) return { error: error.message };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { missing: true as const };
    return { user: toPortalUserFromOfficer(row as Record<string, unknown>) };
  };

  let result = preferSupervisor ? await updateSupervisor() : await updateOfficerPortal();
  if ('missing' in result && result.missing) {
    result = preferSupervisor ? await updateOfficerPortal() : await updateSupervisor();
  }

  if ('error' in result && result.error) {
    return res.status(500).json({ error: result.error });
  }
  if ('missing' in result && result.missing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updated = (result as { user: ReturnType<typeof toPortalUserFromOfficer> }).user;

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    `Updated portal user status to ${updated.status}`,
    updated.userId
  );

  return res.json(updated);
}));

router.delete('/:officerId', async (req, res) => {
  const authReq = req as unknown as AdminRequest;
  const officerId = Number(req.params.officerId);
  const sourceParam = String(req.query.source ?? '').trim() as PortalSource | '';
  const roleIdParam = Number(req.query.roleId);

  if (!Number.isFinite(officerId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  if (officerId === authReq.adminOfficerId && (!sourceParam || sourceParam === 'officer_users')) {
    return res.status(400).json({ error: 'You cannot remove your own account' });
  }

  const preferSupervisor =
    sourceParam === 'supervisor_users' ||
    (!sourceParam && roleIdParam === ROLE_SUPERVISOR);

  const tryDeleteOfficer = async () => {
    const { data: targetRows, error: fetchError } = await serviceSupabase
      .from('officer_users')
      .select('*')
      .eq('officer_id', officerId)
      .in('role_id', PORTAL_ROLES)
      .limit(1);

    if (fetchError) return { error: fetchError.message as string };
    const target = Array.isArray(targetRows) ? targetRows[0] : null;
    if (!target) return { missing: true as const };

    const email = String(target.officer_email_address);
    const removedUserId = portalUserId(officerId, Number(target.role_id));

    const { error: deleteError } = await serviceSupabase
      .from('officer_users')
      .delete()
      .eq('officer_id', officerId);

    if (deleteError) return { error: deleteError.message };
    return { email, removedUserId };
  };

  const tryDeleteSupervisor = async () => {
    const { data: targetRows, error: fetchError } = await serviceSupabase
      .from('supervisor_users')
      .select('*')
      .eq('supervisor_id', officerId)
      .limit(1);

    if (fetchError) return { error: fetchError.message as string };
    const target = Array.isArray(targetRows) ? targetRows[0] : null;
    if (!target) return { missing: true as const };

    const email = String(target.supervisor_email_address);
    const removedUserId = portalUserId(officerId, ROLE_SUPERVISOR);

    const { error: deleteError } = await serviceSupabase
      .from('supervisor_users')
      .delete()
      .eq('supervisor_id', officerId);

    if (deleteError) return { error: deleteError.message };
    return { email, removedUserId };
  };

  let result = preferSupervisor ? await tryDeleteSupervisor() : await tryDeleteOfficer();
  if ('missing' in result && result.missing) {
    result = preferSupervisor ? await tryDeleteOfficer() : await tryDeleteSupervisor();
  }

  if ('error' in result && result.error) {
    return res.status(500).json({ error: result.error });
  }
  if ('missing' in result && result.missing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { email, removedUserId } = result as { email: string; removedUserId: string };

  try {
    const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (authUser) {
      await serviceSupabase.auth.admin.deleteUser(authUser.id);
    }
  } catch {
    // Profile removed; auth cleanup is best-effort
  }

  await writeAuditLog(authReq.userEmail ?? 'unknown', 'Removed portal user', removedUserId);

  return res.json({ removed: officerId });
});

export default router;
