import { Router } from 'express';
import { supabase } from '../supabase';
import type { UserProfile, UserRole } from '../types';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({ error: error?.message ?? 'Login failed' });
  }

  const { data: profileData, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('uid', data.user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  if (!profileData) {
    return res.status(404).json({ error: 'User profile not found. Please register first.' });
  }

  const profile = profileData as UserProfile;

  return res.json({
    session: data.session,
    user: data.user,
    profile
  });
});

router.post('/register', async (req, res) => {
  const { email, password, name, badgeNumber, role } = req.body;
  const normalizedRole = role === 'supervisor' ? 'supervisor' : 'officer';

  if (!email || !password || !name || !badgeNumber) {
    return res.status(400).json({ error: 'Email, password, name, and badge number are required' });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: normalizedRole }
  });

  if (error || !data.user) {
    return res.status(400).json({ error: error?.message ?? 'Registration failed' });
  }

  const profile: UserProfile = {
    uid: data.user.id,
    email,
    name,
    badgeNumber,
    role: normalizedRole as UserRole,
    createdAt: new Date().toISOString()
  };

  const { error: insertError } = await supabase.from('users').insert([profile]);

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError || !loginData.session) {
    return res.status(201).json({ user: data.user, profile });
  }

  return res.status(201).json({
    user: data.user,
    profile,
    session: loginData.session
  });
});

export default router;
