import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { ROLE_SUPERVISOR } from '../constants/roles';
import { portalUserId, roleLabel } from '../constants/roles';
import { writeAuditLog } from '../utilities/auditLog';
import { resolveProfileByEmail } from '../utilities/resolveProfile';

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
