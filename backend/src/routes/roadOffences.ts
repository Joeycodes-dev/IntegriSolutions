import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { readJson } from '../utilities/jsonBody';
import type { UploadedFile } from '../utilities/uploads';
import { hashData } from '../utilities/hash';
import { resolveProfileByEmail } from '../utilities/resolveProfile';
import { serviceSupabase } from '../serviceSupabase';

const router = new Hono<AppEnv>();

const OFFENCE_TYPES = new Set([
  'driving_without_valid_licence', 'expired_driving_licence', 'expired_vehicle_licence_disc',
  'vehicle_not_roadworthy', 'defective_lights', 'unsafe_tyres', 'no_seat_belt',
  'mobile_phone_use', 'speeding', 'traffic_control_non_compliance',
  'reckless_or_negligent_driving', 'unsafe_overtaking', 'overloading',
  'registration_or_number_plate_non_compliance', 'other'
]);
const ACTIONS = new Set(['warning', 'fine_or_notice', 'vehicle_discontinued', 'referred', 'arrested', 'other']);
const REVIEW_ACTIONS = new Set(['verified', 'correction_requested', 'referred', 'closed']);

const MAX_PHOTO_FILES = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoUploadResult =
  | { ok: true; files: UploadedFile[] }
  | { ok: false; response: Response };

async function readPhotoUpload(c: Context<AppEnv>): Promise<PhotoUploadResult> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return { ok: true, files: [] };
  }

  const formData = await c.req.formData();
  const files: UploadedFile[] = [];
  let seen = 0;

  for (const [key, value] of formData.entries()) {
    if (key !== 'photos' || !(value instanceof File)) continue;
    seen += 1;
    if (seen > MAX_PHOTO_FILES) {
      return { ok: false, response: c.json({ error: 'Too many files' }, 500) };
    }
    // Old multer fileFilter silently skipped disallowed types.
    if (!ALLOWED_PHOTO_TYPES.includes(value.type)) continue;
    if (value.size > MAX_PHOTO_BYTES) {
      return { ok: false, response: c.json({ error: 'File too large' }, 500) };
    }
    const buffer = new Uint8Array(await value.arrayBuffer());
    files.push({
      fieldname: 'photos',
      originalname: value.name,
      encoding: '7bit',
      mimetype: value.type,
      buffer,
      size: buffer.byteLength
    });
  }

  return { ok: true, files };
}

router.post('/', requireAuth, async (c) => {
  const body = await readJson(c);
  const offenceType = typeof body.offenceType === 'string' ? body.offenceType : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const actionTaken = typeof body.actionTaken === 'string' ? body.actionTaken : '';
  const location = body.location;
  const id = typeof body.id === 'string' ? body.id : '';

  if (!id || !OFFENCE_TYPES.has(offenceType) || !ACTIONS.has(actionTaken) || !notes || !location || typeof location !== 'object') {
    return c.json({ error: 'Missing or invalid road offence payload' }, 400);
  }
  if (offenceType === 'other' && !notes) {
    return c.json({ error: 'Notes are required for other road offences' }, 400);
  }

  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users') {
    return c.json({ error: 'Only officer accounts can submit road offences' }, 403);
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
  if (existing) return c.json({ error: 'Road offence already submitted' }, 409);

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

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

router.get('/', requireAuth, async (c) => {
  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || (actor.source !== 'supervisor_users' && actor.source !== 'admin_users')) {
    return c.json({ error: 'Only supervisor or administrator accounts can review road offences' }, 403);
  }

  const { data, error } = await serviceSupabase
    .from('road_offences')
    .select('*, road_offence_reviews(*), road_offence_evidence(*)')
    .order('created_at', { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

router.post('/:id/reviews', requireAuth, async (c) => {
  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || (actor.source !== 'supervisor_users' && actor.source !== 'admin_users')) {
    return c.json({ error: 'Only supervisor or administrator accounts can review road offences' }, 403);
  }
  const body = await readJson(c);
  const action = typeof body.action === 'string' ? body.action : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!REVIEW_ACTIONS.has(action) || !reason) {
    return c.json({ error: 'A valid review action and reason are required' }, 400);
  }

  const { data, error } = await serviceSupabase.from('road_offence_reviews').insert([{
    road_offence_id: c.req.param('id'),
    reviewer_source: actor.source,
    reviewer_id: actor.dbId,
    reviewer_name: `${actor.profile.name} ${actor.profile.surname}`.trim(),
    action,
    reason
  }]).select().single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

router.post('/:id/evidence', requireAuth, async (c) => {
  const parsed = await readPhotoUpload(c);
  if (!parsed.ok) {
    return parsed.response;
  }
  const files = parsed.files;

  const actor = await resolveProfileByEmail(c.get('userEmail') ?? '', c.get('userId'), serviceSupabase, c.get('preferredRoleId'));
  if (!actor || actor.source !== 'officer_users') return c.json({ error: 'Only officer accounts can upload road offence evidence' }, 403);

  if (!files.length) return c.json({ error: 'At least one photo is required' }, 400);
  const { data: offence, error: offenceError } = await serviceSupabase
    .from('road_offences').select('id, officer_id').eq('id', c.req.param('id')).maybeSingle();
  if (offenceError) return c.json({ error: offenceError.message }, 500);
  if (!offence) return c.json({ error: 'Road offence not found' }, 404);
  if (Number(offence.officer_id) !== actor.dbId) return c.json({ error: 'You can only upload evidence for your own road offences' }, 403);

  const uploaded = [];
  for (const file of files) {
    const extension = file.originalname.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'jpg';
    const storagePath = `road-offences/${c.req.param('id')}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error: storageError } = await serviceSupabase.storage.from('evidence').upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
    if (storageError) return c.json({ error: `Evidence storage upload failed: ${storageError.message}` }, 500);
    const { data: urlData } = serviceSupabase.storage.from('evidence').getPublicUrl(storagePath);
    const { data, error } = await serviceSupabase.from('road_offence_evidence').insert([{
      road_offence_id: c.req.param('id'), storage_path: storagePath, storage_url: urlData.publicUrl,
      file_name: file.originalname, file_type: file.mimetype, file_size: file.size, uploaded_by: actor.dbId
    }]).select().single();
    if (error) return c.json({ error: error.message }, 500);
    uploaded.push(data);
  }
  return c.json({ photos: uploaded }, 201);
});

export default router;
