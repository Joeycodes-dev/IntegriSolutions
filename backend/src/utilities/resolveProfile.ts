import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

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

interface OfficerRow {
  officer_id: number;
  officer_email_address: string;
  officer_name: string;
  officer_surname: string;
  badge_number: string;
  officer_id_number: number;
  officer_employment_status: string;
  province: string;
  region: string;
  officer_type_id: number;
  role_id: number;
  created_at: string;
}

interface SupervisorRow {
  supervisor_id: number;
  supervisor_email_address: string;
  supervisor_name: string;
  supervisor_surname: string;
  badge_number: string;
  supervisor_id_number: number;
  employment_status: string;
  province: string;
  region: string;
  officer_type_id: number;
  role_id: number;
  created_at: string;
}

export type ProfileSource = 'officer_users' | 'supervisor_users';

export interface ResolvedProfile {
  profile: UserProfile;
  source: ProfileSource;
  dbId: number;
}

function fromOfficerRow(row: OfficerRow, uid: string): ResolvedProfile {
  return {
    source: 'officer_users',
    dbId: row.officer_id,
    profile: {
      uid,
      officerId: row.officer_id,
      email: row.officer_email_address,
      name: row.officer_name,
      surname: row.officer_surname,
      badgeNumber: row.badge_number,
      idNumber: String(row.officer_id_number),
      employmentStatus: row.officer_employment_status,
      province: row.province,
      region: row.region,
      officerTypeId: row.officer_type_id,
      roleId: row.role_id,
      createdAt: row.created_at
    }
  };
}

function fromSupervisorRow(row: SupervisorRow, uid: string): ResolvedProfile {
  return {
    source: 'supervisor_users',
    dbId: row.supervisor_id,
    profile: {
      uid,
      officerId: row.supervisor_id,
      email: row.supervisor_email_address,
      name: row.supervisor_name,
      surname: row.supervisor_surname,
      badgeNumber: row.badge_number,
      idNumber: String(row.supervisor_id_number),
      employmentStatus: row.employment_status,
      province: row.province,
      region: row.region,
      officerTypeId: row.officer_type_id,
      roleId: row.role_id,
      createdAt: row.created_at
    }
  };
}

export async function resolveProfileByEmail(
  email: string,
  uid: string,
  client: SupabaseClient = serviceSupabase
): Promise<ResolvedProfile | null> {
  const { data: officerRows, error: officerError } = await client
    .from('officer_users')
    .select('*')
    .eq('officer_email_address', email)
    .limit(1);

  if (officerError) {
    throw new Error(officerError.message);
  }

  const officer = Array.isArray(officerRows) ? officerRows[0] : null;
  if (officer) {
    return fromOfficerRow(officer as OfficerRow, uid);
  }

  const { data: supervisorRows, error: supervisorError } = await client
    .from('supervisor_users')
    .select('*')
    .eq('supervisor_email_address', email)
    .limit(1);

  if (supervisorError) {
    throw new Error(supervisorError.message);
  }

  const supervisor = Array.isArray(supervisorRows) ? supervisorRows[0] : null;
  if (supervisor) {
    return fromSupervisorRow(supervisor as SupervisorRow, uid);
  }

  return null;
}

export async function resolveRoleByEmail(
  email: string,
  client: SupabaseClient = serviceSupabase
): Promise<{ dbId: number; roleId: number; source: ProfileSource } | null> {
  const { data: officerRows } = await client
    .from('officer_users')
    .select('officer_id, role_id')
    .eq('officer_email_address', email)
    .limit(1);

  const officer = Array.isArray(officerRows) ? officerRows[0] : null;
  if (officer) {
    return { dbId: officer.officer_id, roleId: Number(officer.role_id), source: 'officer_users' };
  }

  const { data: supervisorRows } = await client
    .from('supervisor_users')
    .select('supervisor_id, role_id')
    .eq('supervisor_email_address', email)
    .limit(1);

  const supervisor = Array.isArray(supervisorRows) ? supervisorRows[0] : null;
  if (supervisor) {
    return { dbId: supervisor.supervisor_id, roleId: Number(supervisor.role_id), source: 'supervisor_users' };
  }

  return null;
}
