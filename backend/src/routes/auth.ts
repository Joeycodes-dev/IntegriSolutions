import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { ROLE_OFFICER, ROLE_SUPERVISOR } from '../constants/roles';
import { portalUserId, roleLabel } from '../constants/roles';
import { writeAuditLog } from '../utilities/auditLog';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { asyncHandler } from '../asyncHandler';
import { extractOfficerInviteToken, hashOfficerInviteToken } from '../utilities/officerInvites';

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

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError || !authData.session || !authData.user) {
    return res.status(401).json({ error: authError?.message ?? 'Login failed' });
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(email, authData.user.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved) {
    return res.status(404).json({ error: 'Profile not found. Please register first.' });
  }

  return res.json({
    session: authData.session,
    user: authData.user,
    profile: resolved.profile
  });
});

router.post('/officer-invite', asyncHandler(async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const inviteInput = String(body.invite ?? body.inviteLink ?? body.token ?? '');
  const password = String(body.password ?? '');

  if (!inviteInput || !password) {
    return res.status(400).json({ error: 'Invite link and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const token = extractOfficerInviteToken(inviteInput);
  if (!token) {
    return res.status(400).json({ error: 'Invalid invite link' });
  }

  const { data: inviteRows, error: inviteError } = await serviceSupabase
    .from('officer_invitations')
    .select('*')
    .eq('token_hash', hashOfficerInviteToken(token))
    .limit(1);

  if (inviteError) {
    return res.status(500).json({ error: inviteError.message });
  }

  const invite = Array.isArray(inviteRows) ? inviteRows[0] as Record<string, unknown> : null;
  if (!invite) {
    return res.status(400).json({ error: 'Invite link is invalid or has been revoked' });
  }

  if (invite.accepted_at) {
    return res.status(409).json({ error: 'Invite link has already been used' });
  }

  const expiresAt = new Date(String(invite.expires_at));
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    return res.status(410).json({ error: 'Invite link has expired. Ask your supervisor for a new invite.' });
  }

  const officerId = Number(invite.officer_id);
  const { data: officerRows, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_id', officerId)
    .limit(1);

  if (officerError) {
    return res.status(500).json({ error: officerError.message });
  }

  const officer = Array.isArray(officerRows) ? officerRows[0] as Record<string, unknown> : null;
  if (!officer || Number(officer.role_id) !== ROLE_OFFICER) {
    return res.status(404).json({ error: 'Officer profile not found for this invite' });
  }

  const email = String(officer.officer_email_address ?? '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: 'Officer invite does not have an email address. Ask your supervisor for a new invite.' });
  }

  const { data: officerEmailRows } = await serviceSupabase
    .from('officer_users')
    .select('officer_id')
    .eq('officer_email_address', email)
    .limit(1);
  const existingOfficer = Array.isArray(officerEmailRows) ? officerEmailRows[0] as Record<string, unknown> : null;
  if (existingOfficer && Number(existingOfficer.officer_id) !== officerId) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const { data: supervisorRows } = await serviceSupabase
    .from('supervisor_users')
    .select('supervisor_id')
    .eq('supervisor_email_address', email)
    .limit(1);
  if (supervisorRows?.length) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === email);
  if (existingAuth) {
    return res.status(409).json({ error: 'An auth account with this email already exists' });
  }

  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    const msg = authError?.message ?? 'Failed to create officer login';
    const status = msg.toLowerCase().includes('already') ? 409 : 400;
    return res.status(status).json({ error: msg });
  }

  const { error: profileError } = await serviceSupabase
    .from('officer_users')
    .update({
      officer_employment_status: 'Active'
    })
    .eq('officer_id', officerId);

  if (profileError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: (profileError as DbError).message ?? 'Failed to activate officer profile' });
  }

  const acceptedAt = new Date().toISOString();
  const { error: inviteUpdateError } = await serviceSupabase
    .from('officer_invitations')
    .update({ accepted_at: acceptedAt, accepted_email: email })
    .eq('id', invite.id);

  if (inviteUpdateError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: inviteUpdateError.message });
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session || !loginData.user) {
    return res.status(500).json({ error: loginError?.message ?? 'Officer login was created but automatic sign-in failed' });
  }

  const resolved = await resolveProfileByEmail(email, loginData.user.id);
  if (!resolved) {
    return res.status(500).json({ error: 'Officer profile activation failed' });
  }

  await writeAuditLog(email, 'Accepted officer invite', portalUserId(resolved.dbId, resolved.profile.roleId));

  return res.status(201).json({
    session: loginData.session,
    user: loginData.user,
    profile: resolved.profile
  });
}));

router.post('/register', async (req, res) => {
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
  } = req.body;

  if (!email || !password || !name || !surname || !badgeNumber || !idNumber) {
    return res.status(400).json({
      error: 'Email, password, name, surname, badge number, and ID number are required'
    });
  }

  const resolvedRoleId = Number(roleId ?? 1);
  if (resolvedRoleId === ROLE_OFFICER) {
    return res.status(403).json({ error: 'Officer accounts must be created with an invite from the web portal.' });
  }

  const isSupervisor = resolvedRoleId === ROLE_SUPERVISOR;

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

  if (existingOfficers?.length || existingSupervisors?.length) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const { data: authList } = await serviceSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const orphanAuth = authList?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (orphanAuth) {
    await serviceSupabase.auth.admin.deleteUser(orphanAuth.id);
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message ?? 'Registration failed' });
  }

  if (isSupervisor) {
    const { error: insertError } = await serviceSupabase.from('supervisor_users').insert([{
      supervisor_email_address: email,
      supervisor_name: name,
      supervisor_surname: surname,
      supervisor_id_number: Number(idNumber),
      badge_number: badgeNumber,
      employment_status: employmentStatus ?? 'Active',
      province: province ?? '',
      region: region ?? '',
      officer_type_id: Number(officerTypeId ?? 1),
      role_id: resolvedRoleId
    }]);

    if (insertError) {
      await serviceSupabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: insertError.message });
    }
  } else {
    const { error: insertError } = await serviceSupabase.from('officer_users').insert([{
      officer_email_address: email,
      officer_name: name,
      officer_surname: surname,
      officer_id_number: Number(idNumber),
      badge_number: badgeNumber,
      officer_employment_status: employmentStatus ?? 'Active',
      province: province ?? '',
      region: region ?? '',
      officer_type_id: Number(officerTypeId ?? 1),
      role_id: resolvedRoleId
    }]);

    if (insertError) {
      await serviceSupabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: insertError.message });
    }
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session) {
    return res.status(201).json({ user: authData.user });
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

  return res.status(201).json({
    user: authData.user,
    profile,
    session: loginData.session
  });
});

export default router;
