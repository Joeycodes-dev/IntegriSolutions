import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { UserProfile } from '../types';
import { ROLE_ADMIN, portalUserId } from '../constants/roles';
import { writeAuditLog } from '../utilities/auditLog';

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

  const { data: officerRows, error: officerError } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_email_address', email)
    .limit(1);

  if (officerError) {
    return res.status(500).json({ error: officerError.message });
  }

  const officerData = Array.isArray(officerRows) ? officerRows[0] : null;

  if (!officerData) {
    return res.status(404).json({ error: 'Officer profile not found. Please register first.' });
  }

  const profile: UserProfile = {
    uid: authData.user.id,
    officerId: officerData.officer_id,
    email: officerData.officer_email_address,
    name: officerData.officer_name,
    surname: officerData.officer_surname,
    badgeNumber: officerData.badge_number,
    idNumber: String(officerData.officer_id_number),
    employmentStatus: officerData.officer_employment_status,
    province: officerData.province,
    region: officerData.region,
    officerTypeId: officerData.officer_type_id,
    roleId: officerData.role_id,
    createdAt: officerData.created_at
  };

  return res.json({
    session: authData.session,
    user: authData.user,
    profile
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

  if (Number(roleId) !== ROLE_ADMIN) {
    return res.status(400).json({
      error: 'Self-registration is only available for admin accounts. Supervisors are added by an administrator.'
    });
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError || !authData.user) {
    return res.status(400).json({ error: authError?.message ?? 'Registration failed' });
  }

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
    role_id: Number(roleId ?? 1)
  }]);

  if (insertError) {
    await serviceSupabase.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: insertError.message });
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session) {
    return res.status(201).json({ user: authData.user });
  }

  const { data: officerRows } = await serviceSupabase
    .from('officer_users')
    .select('*')
    .eq('officer_email_address', email)
    .limit(1);

  const officerData = Array.isArray(officerRows) ? officerRows[0] : null;

  const profile: UserProfile = {
    uid: authData.user.id,
    officerId: officerData?.officer_id,
    email: officerData?.officer_email_address ?? email,
    name: officerData?.officer_name ?? name,
    surname: officerData?.officer_surname ?? surname,
    badgeNumber: officerData?.badge_number ?? badgeNumber,
    idNumber: String(officerData?.officer_id_number ?? idNumber),
    employmentStatus: officerData?.officer_employment_status ?? 'Active',
    province: officerData?.province ?? '',
    region: officerData?.region ?? '',
    officerTypeId: officerData?.officer_type_id ?? 1,
    roleId: officerData?.role_id ?? 1,
    createdAt: officerData?.created_at ?? new Date().toISOString()
  };

  if (officerData?.officer_id) {
    await writeAuditLog(
      email,
      'Registered admin account',
      portalUserId(Number(officerData.officer_id), ROLE_ADMIN)
    );
  }

  return res.status(201).json({
    user: authData.user,
    profile,
    session: loginData.session
  });
});

export default router;
