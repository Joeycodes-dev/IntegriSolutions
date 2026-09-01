import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { hashData } from '../utilities/hash';
import { resolveProfileByEmail } from '../utilities/resolveProfile';

const router = Router();

const OFFENCE_TYPES = new Set([
  'driving_without_valid_licence', 'expired_driving_licence', 'expired_vehicle_licence_disc',
  'vehicle_not_roadworthy', 'defective_lights', 'unsafe_tyres', 'no_seat_belt',
  'mobile_phone_use', 'speeding', 'traffic_control_non_compliance',
  'reckless_or_negligent_driving', 'unsafe_overtaking', 'overloading',
  'registration_or_number_plate_non_compliance', 'other'
]);
const ACTIONS = new Set(['warning', 'fine_or_notice', 'vehicle_discontinued', 'referred', 'arrested', 'other']);
const REVIEW_ACTIONS = new Set(['verified', 'correction_requested', 'referred', 'closed']);
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

const serviceSupabase = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false, detectSessionInUrl: false }
});

router.post('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const body = req.body as Record<string, unknown>;
  const offenceType = typeof body.offenceType === 'string' ? body.offenceType : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const actionTaken = typeof body.actionTaken === 'string' ? body.actionTaken : '';
  const location = body.location;
  const id = typeof body.id === 'string' ? body.id : '';

  if (!id || !OFFENCE_TYPES.has(offenceType) || !ACTIONS.has(actionTaken) || !notes || !location || typeof location !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid road offence payload' });
  }
  if (offenceType === 'other' && !notes) {
    return res.status(400).json({ error: 'Notes are required for other road offences' });
  }

  const actor = await resolveProfileByEmail(authReq.userEmail ?? '', authReq.userId, serviceSupabase, authReq.preferredRoleId);
  if (!actor || actor.source !== 'officer_users') {
    return res.status(403).json({ error: 'Only officer accounts can submit road offences' });
  }

  const createdAt = new Date().toISOString();
  const record = {
    officerId: actor.dbId,
    officerName: `${actor.profile.name} ${actor.profile.surname}`.trim(),
    badgeNumber: actor.profile.badgeNumber,
    offenceType,
    driverName: typeof body.driverName === 'string' ? body.driverName.trim() : '',
    driverIdentifier: typeof body.driverIdentifier === 'string' ? body.driverIdentifier.trim() : '',
    vehicleRegistration: typeof body.vehicleRegistration === 'string' ? body.vehicleRegistration.trim() : '',
    vehicleDescription: typeof body.vehicleDescription === 'string' ? body.vehicleDescription.trim() : '',
    notes,
    actionTaken,
    referenceNumber: typeof body.referenceNumber === 'string' ? body.referenceNumber.trim() || null : null,
    location,
    createdAt
  };

  const { data: existing } = await serviceSupabase.from('road_offences').select('id').eq('id', id).maybeSingle();
  if (existing) return res.status(409).json({ error: 'Road offence already submitted' });

  const { data, error } = await serviceSupabase.from('road_offences').insert([{
    id,
    officer_id: record.officerId,
    officer_name: record.officerName,
    badge_number: record.badgeNumber,
    offence_type: record.offenceType,
    driver_name: record.driverName,
    driver_identifier: record.driverIdentifier,
    vehicle_registration: record.vehicleRegistration,
    vehicle_description: record.vehicleDescription,
    notes: record.notes,
    action_taken: record.actionTaken,
    reference_number: record.referenceNumber,
    location: record.location,
    hash: hashData(record),
    created_at: record.createdAt
  }]).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

router.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const actor = await resolveProfileByEmail(authReq.userEmail ?? '', authReq.userId, serviceSupabase, authReq.preferredRoleId);
  if (!actor || (actor.source !== 'supervisor_users' && actor.source !== 'admin_users')) {
    return res.status(403).json({ error: 'Only supervisor or administrator accounts can review road offences' });
  }

  const { data, error } = await serviceSupabase
    .from('road_offences')
    .select('*, road_offence_reviews(*), road_offence_evidence(*)')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data ?? []);
});

router.post('/:id/reviews', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest;
  const actor = await resolveProfileByEmail(authReq.userEmail ?? '', authReq.userId, serviceSupabase, authReq.preferredRoleId);
  if (!actor || (actor.source !== 'supervisor_users' && actor.source !== 'admin_users')) {
    return res.status(403).json({ error: 'Only supervisor or administrator accounts can review road offences' });
  }
  const action = typeof req.body?.action === 'string' ? req.body.action : '';
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!REVIEW_ACTIONS.has(action) || !reason) {
    return res.status(400).json({ error: 'A valid review action and reason are required' });
  }

  const { data, error } = await serviceSupabase.from('road_offence_reviews').insert([{
    road_offence_id: req.params.id,
    reviewer_source: actor.source,
    reviewer_id: actor.dbId,
    reviewer_name: `${actor.profile.name} ${actor.profile.surname}`.trim(),
    action,
    reason
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

router.post('/:id/evidence', requireAuth, evidenceUpload.array('photos', 5), async (req, res) => {
  const authReq = req as AuthRequest;
  const actor = await resolveProfileByEmail(authReq.userEmail ?? '', authReq.userId, serviceSupabase, authReq.preferredRoleId);
  if (!actor || actor.source !== 'officer_users') return res.status(403).json({ error: 'Only officer accounts can upload road offence evidence' });

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files?.length) return res.status(400).json({ error: 'At least one photo is required' });
  const { data: offence, error: offenceError } = await serviceSupabase
    .from('road_offences').select('id, officer_id').eq('id', req.params.id).maybeSingle();
  if (offenceError) return res.status(500).json({ error: offenceError.message });
  if (!offence) return res.status(404).json({ error: 'Road offence not found' });
  if (Number(offence.officer_id) !== actor.dbId) return res.status(403).json({ error: 'You can only upload evidence for your own road offences' });

  const uploaded = [];
  for (const file of files) {
    const extension = file.originalname.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const storagePath = `road-offences/${req.params.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error: storageError } = await serviceSupabase.storage.from('evidence').upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (storageError) return res.status(500).json({ error: `Evidence storage upload failed: ${storageError.message}` });
    const { data: urlData } = serviceSupabase.storage.from('evidence').getPublicUrl(storagePath);
    const { data, error } = await serviceSupabase.from('road_offence_evidence').insert([{
      road_offence_id: req.params.id, storage_path: storagePath, storage_url: urlData.publicUrl,
      file_name: file.originalname, file_type: file.mimetype, file_size: file.size, uploaded_by: actor.dbId
    }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    uploaded.push(data);
  }
  return res.status(201).json({ photos: uploaded });
});

export default router;