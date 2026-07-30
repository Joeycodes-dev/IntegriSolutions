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
import {
  buildSupervisorInviteLink,
  generateOfficerInviteToken,
  hashOfficerInviteToken,
  officerInviteExpiresAt
} from '../../utilities/officerInvites';
import { sendSupervisorInviteEmail } from '../../utilities/email';

const router = Router();

type DbError = { message?: string; code?: string; details?: string; hint?: string };
type PortalSource = 'officer_users' | 'supervisor_users' | 'admin_users';

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
  table: 'officer_users' | 'supervisor_users' | 'admin_users',
  idColumn: 'officer_id_number' | 'supervisor_id_number' | 'admin_id_number',
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
  const [{ data: officers }, { data: supervisors }, { data: admins }] = await Promise.all([
    serviceSupabase
      .from('officer_users')
      .select('officer_id')
      .eq('officer_email_address', normalized)
      .limit(1),
    serviceSupabase
      .from('supervisor_users')
      .select('supervisor_id')
      .eq('supervisor_email_address', normalized)
      .limit(1),
    serviceSupabase
      .from('admin_users')
      .select('admin_id')
      .eq('admin_email_address', normalized)
      .limit(1)
  ]);
  return Boolean(officers?.length || supervisors?.length || admins?.length);
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

function toPortalUserFromAdmin(row: Record<string, unknown>) {
  const adminId = Number(row.admin_id);
  const roleId = Number(row.role_id) || ROLE_ADMIN;
  return {
    officerId: adminId,
    userId: portalUserId(adminId, roleId),
    name: `${row.admin_name} ${row.admin_surname}`.trim(),
    email: String(row.admin_email_address),
    role: roleLabel(roleId),
    roleId,
    station: String(row.region || row.province || '—'),
    status: String(row.employment_status || 'Active'),
    createdAt: String(row.created_at ?? ''),
    source: 'admin_users' as const
  };
}

router.use(requireAdmin);

router.get('/', async (_req, res) => {
  const [adminsResult, supervisorsResult] = await Promise.all([
    serviceSupabase
      .from('admin_users')
      .select('*')
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
    ...(adminsResult.data ?? []).map((row) => toPortalUserFromAdmin(row as Record<string, unknown>)),
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

  if (!email || !name || !surname) {
    return res.status(400).json({
      error:
        Object.keys(body).length === 0
          ? 'Request body is missing. Send JSON with Content-Type: application/json.'
          : 'Email, name, and surname are required'
    });
  }

  const resolvedRoleId = Number(roleId);
  if (resolvedRoleId !== ROLE_SUPERVISOR && resolvedRoleId !== ROLE_ADMIN) {
    return res.status(400).json({ error: 'Role must be Supervisor or Admin' });
  }

  if (resolvedRoleId === ROLE_ADMIN && !password) {
    return res.status(400).json({ error: 'Password is required when creating an admin account' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (await emailTaken(normalizedEmail)) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  let created:
    | ReturnType<typeof toPortalUserFromOfficer>
    | ReturnType<typeof toPortalUserFromSupervisor>
    | ReturnType<typeof toPortalUserFromAdmin>;

  if (resolvedRoleId === ROLE_SUPERVISOR) {
    const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (existingAuth) {
      return res.status(409).json({ error: 'An auth account with this email already exists' });
    }

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
          employment_status: 'Invited',
          province: rank?.trim() || '',
          region: station ?? '',
          officer_type_id: 1,
          role_id: ROLE_SUPERVISOR
        }
      ])
      .select('*');

    if (insertError || !inserted?.length) {
      console.error('[admin/users] supervisor insert failed:', insertError);
      return res.status(500).json({
        error: formatDbError(insertError as DbError | null),
        code: (insertError as DbError | null)?.code
      });
    }

    created = toPortalUserFromSupervisor(inserted[0] as Record<string, unknown>);

    const token = generateOfficerInviteToken();
    const expiresAt = officerInviteExpiresAt();
    let inviteLink: string | undefined;
    let inviteEmailSent = false;
    let emailWarning: string | undefined;

    const { error: inviteError } = await serviceSupabase.from('supervisor_invitations').insert([{
      supervisor_id: created.officerId,
      token_hash: hashOfficerInviteToken(token),
      created_by_email: authReq.userEmail ?? null,
      expires_at: expiresAt
    }]);

    if (inviteError) {
      console.warn('[admin/users] supervisor invite table insert failed (table may not exist yet):', inviteError.message);
      emailWarning = 'Invite link unavailable — supervisor_invitations table not set up yet. Supervisor was still created.';
    } else {
      inviteLink = buildSupervisorInviteLink(token);

      try {
        await sendSupervisorInviteEmail({
          to: normalizedEmail,
          supervisorName: `${name} ${surname}`.trim(),
          inviteLink,
          expiresAt
        });
        inviteEmailSent = true;
      } catch (error) {
        emailWarning = error instanceof Error ? error.message : 'Failed to send supervisor invite email';
        console.warn('[admin/users] supervisor invite email failed, returning link:', emailWarning);
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
        ? 'Created supervisor invite'
        : 'Created supervisor invite (email not sent)',
      created.userId
    );

    return res.status(201).json(createdWithInvite);
  } else {
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

    const adminIdNumber = await allocateIdNumber(
      'admin_users',
      'admin_id_number',
      phone,
      serviceNumber,
      idNumber
    );

    const { data: inserted, error: insertError } = await serviceSupabase
      .from('admin_users')
      .insert([
        {
          admin_email_address: normalizedEmail,
          admin_name: name,
          admin_surname: surname,
          admin_id_number: adminIdNumber,
          badge_number: serviceNumber?.trim() || 'ADM',
          employment_status: status ?? 'Active',
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

    created = toPortalUserFromAdmin(inserted[0] as Record<string, unknown>);
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    'Created admin account',
    created.userId
  );

  return res.status(201).json(created);
}));

const PORTAL_STATUSES = ['Active', 'Inactive'] as const;
type PortalUserResult =
  | {
      user:
        | ReturnType<typeof toPortalUserFromOfficer>
        | ReturnType<typeof toPortalUserFromSupervisor>
        | ReturnType<typeof toPortalUserFromAdmin>;
    }
  | { missing: true }
  | { error: string };

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
    officerId === authReq.adminProfileId &&
    (!sourceParam || sourceParam === 'admin_users' || roleIdParam === ROLE_ADMIN)
  ) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const preferAdmin =
    sourceParam === 'admin_users' ||
    (!sourceParam && roleIdParam === ROLE_ADMIN);
  const preferSupervisor =
    sourceParam === 'supervisor_users' ||
    (!sourceParam && roleIdParam === ROLE_SUPERVISOR);

  const updateAdmin = async (): Promise<PortalUserResult> => {
    const patch: Record<string, unknown> = {};
    if (status) patch.employment_status = status;
    if (station !== undefined) patch.region = station;

    const { data, error } = await serviceSupabase
      .from('admin_users')
      .update(patch)
      .eq('admin_id', officerId)
      .select('*')
      .limit(1);

    if (error) return { error: error.message };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return { missing: true as const };
    return { user: toPortalUserFromAdmin(row as Record<string, unknown>) };
  };

  const updateSupervisor = async (): Promise<PortalUserResult> => {
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

  const updateOfficerPortal = async (): Promise<PortalUserResult> => {
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

  const attempts = preferAdmin
    ? [updateAdmin, updateOfficerPortal, updateSupervisor]
    : preferSupervisor
      ? [updateSupervisor, updateOfficerPortal, updateAdmin]
      : [updateOfficerPortal, updateAdmin, updateSupervisor];

  let result: PortalUserResult = { missing: true };
  for (const attempt of attempts) {
    result = await attempt();
    if (!('missing' in result)) break;
  }

  if ('error' in result && result.error) {
    return res.status(500).json({ error: result.error });
  }
  if ('missing' in result && result.missing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updated = (result as Extract<PortalUserResult, { user: unknown }>).user;

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

  if (
    officerId === authReq.adminProfileId &&
    (!sourceParam || sourceParam === 'admin_users' || roleIdParam === ROLE_ADMIN)
  ) {
    return res.status(400).json({ error: 'You cannot remove your own account' });
  }

  const preferAdmin =
    sourceParam === 'admin_users' ||
    (!sourceParam && roleIdParam === ROLE_ADMIN);
  const preferSupervisor =
    sourceParam === 'supervisor_users' ||
    (!sourceParam && roleIdParam === ROLE_SUPERVISOR);

  const tryDeleteAdmin = async () => {
    const { data: targetRows, error: fetchError } = await serviceSupabase
      .from('admin_users')
      .select('*')
      .eq('admin_id', officerId)
      .limit(1);

    if (fetchError) return { error: fetchError.message as string };
    const target = Array.isArray(targetRows) ? targetRows[0] : null;
    if (!target) return { missing: true as const };

    const email = String(target.admin_email_address);
    const removedUserId = portalUserId(officerId, ROLE_ADMIN);

    const { error: deleteError } = await serviceSupabase
      .from('admin_users')
      .delete()
      .eq('admin_id', officerId);

    if (deleteError) return { error: deleteError.message };
    return { email, removedUserId };
  };

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

  const attempts = preferAdmin
    ? [tryDeleteAdmin, tryDeleteOfficer, tryDeleteSupervisor]
    : preferSupervisor
      ? [tryDeleteSupervisor, tryDeleteOfficer, tryDeleteAdmin]
      : [tryDeleteOfficer, tryDeleteAdmin, tryDeleteSupervisor];

  let result:
    | { email: string; removedUserId: string }
    | { missing: true }
    | { error: string } = { missing: true };
  for (const attempt of attempts) {
    result = await attempt();
    if (!('missing' in result)) break;
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
