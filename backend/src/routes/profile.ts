import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { resolveProfileByEmail } from '../utilities/resolveProfile';

const router = Router();

function toProfile(
  uid: string,
  officerData: Record<string, any>,
  dutyStatusOverride?: unknown
): UserProfile {
  return {
    uid,
    officerId: officerData.officer_id,
    email: officerData.officer_email_address,
    name: officerData.officer_name,
    surname: officerData.officer_surname,
    badgeNumber: officerData.badge_number,
    idNumber: String(officerData.officer_id_number),
    employmentStatus: officerData.officer_employment_status,
    // Hardcoded default until duty_status column is added to officer_users
    dutyStatus: normalizeDutyStatus(dutyStatusOverride),
    province: officerData.province,
    region: officerData.region,
    officerTypeId: officerData.officer_type_id,
    roleId: officerData.role_id,
    createdAt: officerData.created_at
  };
}

router.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;

  if (!authReq.userEmail) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  let resolved;
  try {
    resolved = await resolveProfileByEmail(authReq.userEmail, authReq.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Profile lookup failed';
    return res.status(500).json({ error: message });
  }

  if (!resolved) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  return res.json(resolved.profile);
});

export default router;
