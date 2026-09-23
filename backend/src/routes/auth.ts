import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { supabase } from '../supabase';
import { serviceSupabase } from '../serviceSupabase';
import { ROLE_ADMIN, ROLE_OFFICER, ROLE_SUPERVISOR } from '../constants/roles';
import { portalUserId, roleLabel } from '../constants/roles';
import { writeAuditLog } from '../utilities/auditLog';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { extractOfficerInviteToken, hashOfficerInviteToken } from '../utilities/officerInvites';
import { readJson } from '../utilities/jsonBody';

const router = new Hono<AppEnv>();

type DbError = { message?: string; code?: string; details?: string; hint?: string };

router.post('/login', async (c) => {
  const { email, password } = await readJson<{ email?: string; password?: string }>(c);

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !authData.session || !authData.user) {
    return c.json({ error: authError?.message ?? 'Login failed' }, 401);
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(email, authData.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return c.json({ error: message }, 500);
  }

  if (!resolved) {
    return c.json({ error: 'Profile not found. Please register first.' }, 404);
  }

  return c.json({
    session: authData.session,
    user: authData.user,
    profile: resolved.profile
  });
});

router.post('/officer-invite', async (c) => {
  const body = await readJson(c);
  const inviteInput = String(body.invite ?? body.inviteLink ?? body.token ?? '');
  const password = String(body.password ?? '');

  if (!inviteInput || !password) {
    return c.json({ error: 'Invite link and password are required' }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const token = extractOfficerInviteToken(inviteInput);
  if (!token) {
    return c.json({ error: 'Invalid invite link' }, 400);
  }

  const { data: inviteRows, error: inviteError } = await serviceSupabase
    .from('officer_invitations')
    .select('*')
    .eq('token_hash', hashOfficerInviteToken(token))
    .limit(1);

  if (inviteError) {
    return c.json({ error: inviteError.message }, 500);
  }

  const invite = Array.isArray(inviteRows) ? inviteRows[0] as Record<string, unknown> : null;
  if (!invite) {
    return c.json({ error: 'Invite link is invalid or has been revoked' }, 400);
  }

  if (invite.accepted_at) {
    return c.json({ error: 'Invite link has already been used' }, 409);
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return c.json({ error: 'Invite link has expired. Ask your supervisor for a new invite.' }, 410);
  }

  const officerId = Number(invite.officer_id);
  const { data: officerRows, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_id', officerId)
    .limit(1);

  if (officerError) {
    return c.json({ error: officerError.message }, 500);
  }

  const officer = Array.isArray(officerRows) ? officerRows[0] as Record<string, unknown> : null;
  if (!officer || Number(officer.role_id) !== ROLE_OFFICER) {
    return c.json({ error: 'Officer profile not found for this invite' }, 404);
  }

  const email = String(officer.officer_email_address ?? '').trim().toLowerCase();
  if (!email) {
    return c.json({ error: 'Officer invite does not have an email address. Ask your supervisor for a new invite.' }, 400);
  }

  const { data: officerEmailRows } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('officer_email_address', email)
    .limit(1);
  const existingOfficer = Array.isArray(officerEmailRows) ? officerEmailRows[0] as Record<string, unknown> : null;
  if (existingOfficer && Number(existingOfficer.officer_id) !== officerId) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: supervisorRows } = await serviceSupabase
    .from('supervisor_users')
    .select('supervisor_id')
    .eq('supervisor_email_address', email)
    .limit(1);
  if (supervisorRows?.length) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: adminRows } = await serviceSupabase
    .from('admin_users')
    .select('admin_id')
    .eq('admin_email_address', email)
    .limit(1);
  if (adminRows?.length) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existingAuth) {
    return c.json({ error: 'An auth account with this email already exists' }, 409);
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    const msg = authError?.message ?? 'Failed to create officer login';
    const status = msg.toLowerCase().includes('already') ? 409 : 400;
    return c.json({ error: msg }, status);
  }

  const { error: profileError } = await serviceSupabase
    .from('officer_users')
    .update({
      officer_employment_status: 'Active'
    })
    .eq('officer_id', officerId);

  if (profileError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return c.json({ error: (profileError as DbError).message ?? 'Failed to activate officer profile' }, 500);
  }

  const acceptedAt = new Date().toISOString();
  const { error: inviteUpdateError } = await serviceSupabase
    .from('officer_invitations')
    .update({ accepted_at: acceptedAt, accepted_email: email })
    .eq('id', invite.id);

  if (inviteUpdateError) {
    console.warn('[auth] Failed to mark invite as accepted (column may be missing):', inviteUpdateError.message);
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session || !loginData.user) {
    return c.json({ error: loginError?.message ?? 'Officer login was created but automatic sign-in failed' }, 500);
  }

  const resolved = await resolveProfileByEmail(email, loginData.user.id);
  if (!resolved) {
    return c.json({ error: 'Officer profile activation failed' }, 500);
  }

  await writeAuditLog(email, 'Accepted officer invite', portalUserId(resolved.dbId, resolved.profile.roleId));

  return c.json({
    session: loginData.session,
    user: loginData.user,
    profile: resolved.profile
  }, 201);
});

router.post('/supervisor-invite', async (c) => {
  const body = await readJson(c);
  const inviteInput = String(body.invite ?? body.inviteLink ?? body.token ?? '');
  const password = String(body.password ?? '');

  if (!inviteInput || !password) {
    return c.json({ error: 'Invite link and password are required' }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const token = extractOfficerInviteToken(inviteInput);
  if (!token) {
    return c.json({ error: 'Invalid invite link' }, 400);
  }

  const { data: inviteRows, error: inviteError } = await serviceSupabase
    .from('supervisor_invitations')
    .select('*')
    .eq('token_hash', hashOfficerInviteToken(token))
    .limit(1);

  if (inviteError) {
    return c.json({ error: inviteError.message }, 500);
  }

  const invite = Array.isArray(inviteRows) ? inviteRows[0] as Record<string, unknown> : null;
  if (!invite) {
    return c.json({ error: 'Invite link is invalid or has been revoked' }, 400);
  }

  if (invite.accepted_at) {
    return c.json({ error: 'Invite link has already been used' }, 409);
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return c.json({ error: 'Invite link has expired. Ask your administrator for a new invite.' }, 410);
  }

  const supervisorId = Number(invite.supervisor_id);
  const { data: supervisorRows, error: supervisorError } = await serviceSupabase
    .from('supervisor_users')
    .select('*')
    .eq('supervisor_id', supervisorId)
    .limit(1);

  if (supervisorError) {
    return c.json({ error: supervisorError.message }, 500);
  }

  const supervisor = Array.isArray(supervisorRows) ? supervisorRows[0] as Record<string, unknown> : null;
  if (!supervisor || Number(supervisor.role_id) !== ROLE_SUPERVISOR) {
    return c.json({ error: 'Supervisor profile not found for this invite' }, 404);
  }

  const email = String(supervisor.supervisor_email_address ?? '').trim().toLowerCase();
  if (!email) {
    return c.json({ error: 'Supervisor invite does not have an email address. Ask your administrator for a new invite.' }, 400);
  }

  const { data: supervisorEmailRows } = await serviceSupabase
    .from('supervisor_users')
    .select('supervisor_id')
    .eq('supervisor_email_address', email)
    .limit(1);
  const existingSupervisor = Array.isArray(supervisorEmailRows) ? supervisorEmailRows[0] as Record<string, unknown> : null;
  if (existingSupervisor && Number(existingSupervisor.supervisor_id) !== supervisorId) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: officerRows } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('officer_email_address', email)
    .limit(1);
  if (officerRows?.length) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: adminRows } = await serviceSupabase
    .from('admin_users')
    .select('admin_id')
    .eq('admin_email_address', email)
    .limit(1);
  if (adminRows?.length) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existingAuth) {
    return c.json({ error: 'An auth account with this email already exists' }, 409);
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    const msg = authError?.message ?? 'Failed to create supervisor login';
    const status = msg.toLowerCase().includes('already') ? 409 : 400;
    return c.json({ error: msg }, status);
  }

  const { error: profileError } = await serviceSupabase
    .from('supervisor_users')
    .update({
      employment_status: 'Active'
    })
    .eq('supervisor_id', supervisorId);

  if (profileError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return c.json({ error: (profileError as DbError).message ?? 'Failed to activate supervisor profile' }, 500);
  }

  const acceptedAt = new Date().toISOString();
  const { error: inviteUpdateError } = await serviceSupabase
    .from('supervisor_invitations')
    .update({ accepted_at: acceptedAt, accepted_email: email })
    .eq('id', invite.id);

  if (inviteUpdateError) {
    console.warn('[auth] Failed to mark supervisor invite as accepted (column may be missing):', inviteUpdateError.message);
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session || !loginData.user) {
    return c.json({ error: loginError?.message ?? 'Supervisor login was created but automatic sign-in failed' }, 500);
  }

  const resolved = await resolveProfileByEmail(email, loginData.user.id);
  if (!resolved) {
    return c.json({ error: 'Supervisor profile activation failed' }, 500);
  }

  await writeAuditLog(email, 'Accepted supervisor invite', portalUserId(resolved.dbId, resolved.profile.roleId));

  return c.json({
    session: loginData.session,
    user: loginData.user,
    profile: resolved.profile
  }, 201);
});

router.post('/register', async (c) => {
  const {
    email,
    password,
    name,
    surname,
    badgeNumber,
    idNumber,
    employmentStatus,
    province,
    region,
    officerTypeId,
    roleId
  } = await readJson<{
    email?: string;
    password?: string;
    name?: string;
    surname?: string;
    badgeNumber?: string;
    idNumber?: string | number;
    employmentStatus?: string;
    province?: string;
    region?: string;
    officerTypeId?: number | string;
    roleId?: number | string;
  }>(c);

  if (!email || !password || !name || !surname || !badgeNumber || !idNumber) {
    return c.json({
      error: 'Email, password, name, surname, badge number, and ID number are required'
    }, 400);
  }

  const resolvedRoleId = Number(roleId ?? 1);
  if (resolvedRoleId === ROLE_OFFICER) {
    return c.json({
      error: 'Officer accounts must be created with an invite from a supervisor.'
    }, 403);
  }

  if (resolvedRoleId === ROLE_SUPERVISOR) {
    return c.json({
      error: 'Supervisor accounts must be created by an administrator in User Management.'
    }, 403);
  }

  if (resolvedRoleId !== ROLE_ADMIN) {
    return c.json({ error: 'Invalid role for registration' }, 400);
  }

  const { data: existingOfficers } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('officer_email_address', email)
    .limit(1);

  const { data: existingSupervisors } = await serviceSupabase
    .from('supervisor_users')
    .select('supervisor_id')
    .eq('supervisor_email_address', email)
    .limit(1);

  const { data: existingAdminsByEmail } = await serviceSupabase
    .from('admin_users')
    .select('admin_id')
    .eq('admin_email_address', email)
    .limit(1);

  if (existingOfficers?.length || existingSupervisors?.length || existingAdminsByEmail?.length) {
    return c.json({ error: 'A user with this email already exists' }, 409);
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const orphanAuth = authList?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (orphanAuth) {
    await serviceSupabase.auth.admin.deleteUser(orphanAuth.id);
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    return c.json({ error: authError?.message ?? 'Registration failed' }, 400);
  }

  const { error: insertError } = await serviceSupabase.from('admin_users').insert([{
    admin_email_address: email,
    admin_name: name,
    admin_surname: surname,
    admin_id_number: Number(idNumber),
    badge_number: badgeNumber,
    employment_status: employmentStatus ?? 'Active',
    province: province ?? '',
    region: region ?? '',
    officer_type_id: Number(officerTypeId ?? 1),
    role_id: ROLE_ADMIN
  }]);

  if (insertError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return c.json({ error: insertError.message }, 500);
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session) {
    return c.json({ user: authData.user }, 201);
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(email, authData.user.id);
  } catch {
    resolved = null;
  }

  const profile = resolved?.profile ?? {
    uid: authData.user.id,
    email,
    name,
    surname,
    badgeNumber,
    idNumber: String(idNumber),
    employmentStatus: employmentStatus ?? 'Active',
    dutyStatus: 'Off Duty',
    province: province ?? '',
    region: region ?? '',
    officerTypeId: Number(officerTypeId ?? 1),
    roleId: resolvedRoleId,
    createdAt: new Date().toISOString()
  };

  if (resolved?.dbId) {
    await writeAuditLog(
      email,
      `Registered ${roleLabel(resolvedRoleId).toLowerCase()} account`,
      portalUserId(resolved.dbId, resolvedRoleId)
    );
  }

  return c.json({
    user: authData.user,
    profile,
    session: loginData.session
  }, 201);
});

export default router;
