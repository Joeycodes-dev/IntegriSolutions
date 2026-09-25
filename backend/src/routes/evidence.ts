import { createHash } from 'crypto';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { requireAuth } from '../middleware/auth';
import { readJson } from '../utilities/jsonBody';
import { readUpload, type UploadedFile } from '../utilities/uploads';
import { writeAuditLog } from '../utilities/auditLog';
import { serviceSupabase } from '../serviceSupabase';

const router = new Hono<AppEnv>();

const BUCKET = 'evidence';
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function normalizeIdempotencyKey(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return IDEMPOTENCY_KEY.test(candidate) ? candidate : null;
}

function normalizeContentHash(value: unknown): string | null {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SHA256_HEX.test(candidate) ? candidate : null;
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function storedObjectMatches(path: string, expectedHash: string): Promise<boolean> {
  const storage = serviceSupabase.storage.from(BUCKET) as any;
  if (typeof storage.download !== 'function') return false;
  const result = await storage.download(path);
  if (result.error || !result.data) return false;
  const data = result.data as any;
  const bytes = typeof data.arrayBuffer === 'function'
    ? new Uint8Array(await data.arrayBuffer())
    : new Uint8Array(data);
  return hashBytes(bytes) === expectedHash;
}

const EVIDENCE_CATEGORIES = [
  'licence_front',
  'breathalyser_screen',
  'vehicle',
  'scene_note',
  'signature_witness'
] as const;

function normalizeCategory(value: unknown): string | null {
  if (value == null || value === '') return 'vehicle';
  const candidate = typeof value === 'string' ? value.trim() : '';
  return (EVIDENCE_CATEGORIES as readonly string[]).includes(candidate) ? candidate : null;
}

function evidenceMetadataMatches(row: Record<string, unknown>, category: string, notes: string): boolean {
  const storedCategory = typeof row.category === 'string' ? row.category : 'vehicle';
  const storedNotes = typeof row.notes === 'string' ? row.notes.trim() : '';
  return storedCategory === category && storedNotes === notes;
}

router.get('/:testId', requireAuth, async (c) => {
  const testId = String(c.req.param('testId'));

  const { data, error } = await serviceSupabase
    .from('evidence')
    .select('*')
    .eq('test_id', testId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('evidence') || error.code === '42P01') {
      return c.json({
        error: 'Evidence table is not set up. Run the evidence SQL script in your Supabase SQL Editor.'
      }, 503);
    }
    return c.json({ error: error.message }, 500);
  }

  return c.json(data ?? []);
});

router.post('/:testId', requireAuth, async (c) => {
  const testId = String(c.req.param('testId'));

  let file: UploadedFile | null = null;
  let body: Record<string, unknown> = {};

  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const parsed = await readUpload(c, 'photo');
    file = parsed.file;
    body = parsed.fields;

    if (file && !file.mimetype.startsWith('image/')) {
      return c.json({ error: 'Only image files are allowed' }, 400);
    }
    if (file && file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'File too large' }, 413);
    }
  } else {
    body = await readJson(c);
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
  const category = normalizeCategory(body.category);
  if (!category) {
    return c.json({ error: 'Invalid evidence category' }, 400);
  }

  const headerIdempotencyKey = c.req.header('idempotency-key');
  const bodyIdempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
  const headerContentHash = c.req.header('x-content-sha256');
  const bodyContentHash = typeof body.contentHash === 'string' ? body.contentHash : undefined;
  const normalizedHeaderKey = normalizeIdempotencyKey(headerIdempotencyKey);
  const normalizedBodyKey = normalizeIdempotencyKey(bodyIdempotencyKey);
  const normalizedHeaderHash = normalizeContentHash(headerContentHash);
  const normalizedBodyHash = normalizeContentHash(bodyContentHash);

  if (
    (headerIdempotencyKey && !normalizedHeaderKey) ||
    (bodyIdempotencyKey && !normalizedBodyKey) ||
    (headerContentHash && !normalizedHeaderHash) ||
    (bodyContentHash && !normalizedBodyHash)
  ) {
    return c.json({ error: 'Invalid evidence integrity metadata' }, 400);
  }
  if (
    (normalizedHeaderKey && normalizedBodyKey && normalizedHeaderKey !== normalizedBodyKey) ||
    (normalizedHeaderHash && normalizedBodyHash && normalizedHeaderHash !== normalizedBodyHash)
  ) {
    return c.json({ error: 'Evidence integrity headers and form fields do not match' }, 400);
  }

  const idempotencyKey = normalizedHeaderKey ?? normalizedBodyKey;
  const claimedContentHash = normalizedHeaderHash ?? normalizedBodyHash;
  if (!idempotencyKey || !claimedContentHash) {
    return c.json({ error: 'Idempotency-Key and X-Content-SHA256 are required' }, 400);
  }

  if (!file) {
    return c.json({ error: 'Photo file is required' }, 400);
  }

  const contentHash = hashBytes(file.buffer);
  if (claimedContentHash && claimedContentHash !== contentHash) {
    return c.json({ error: 'Evidence content hash does not match the uploaded file' }, 409);
  }

  const { data: testExists } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .limit(1);

  if (!testExists?.length) {
    return c.json({ error: 'Test record not found' }, 404);
  }

  const effectiveIdempotencyKey = idempotencyKey;

  const findExisting = async (): Promise<{ row: Record<string, unknown> | null; error: { code?: string; message?: string } | null }> => {
    if (!idempotencyKey) return { row: null, error: null };
    const query = serviceSupabase
      .from('evidence')
      .select('*')
      .eq('test_id', testId)
      .eq('idempotency_key', idempotencyKey) as any;
    const result = typeof query.limit === 'function'
      ? await query.limit(1)
      : await query.single();
    const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
    return { row, error: result.error ?? null };
  };

  const existingLookup = await findExisting();
  if (existingLookup.error && existingLookup.error.code !== 'PGRST116') {
    return c.json({ error: existingLookup.error.message ?? 'Evidence lookup failed' }, 500);
  }
  if (existingLookup.row) {
    if (existingLookup.row.content_hash !== contentHash) {
      return c.json({ error: 'Idempotency key was already used with different evidence content' }, 409);
    }
    if (!evidenceMetadataMatches(existingLookup.row, category, notes)) {
      return c.json({ error: 'Idempotency key was already used with different evidence metadata' }, 409);
    }
    return c.json({ ...existingLookup.row, duplicate: true, integrity_status: 'verified' }, 200);
  }

  const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const objectKey = createHash('sha256')
    .update(`${testId}|${effectiveIdempotencyKey}`)
    .digest('hex');
  const filePath = `${testId}/${objectKey}.${ext || 'jpg'}`;

  let createdObject = false;
  const { error: uploadError } = await serviceSupabase.storage
    .from(BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (uploadError) {
    const raced = await findExisting();
    if (raced.row?.content_hash === contentHash && evidenceMetadataMatches(raced.row, category, notes)) {
      return c.json({ ...raced.row, duplicate: true, integrity_status: 'verified' }, 200);
    }
    // A process can die after the object upload but before the evidence row
    // insert. Recover that deterministic object instead of creating a second
    // path or losing the upload forever.
    if (!(await storedObjectMatches(filePath, contentHash))) {
      return c.json({ error: `Storage upload failed: ${uploadError.message}` }, 500);
    }
  } else {
    createdObject = true;
  }

  const { data: urlData } = serviceSupabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  const photoUrl = urlData?.publicUrl ?? '';

  const { data: inserted, error: insertError } = await serviceSupabase
    .from('evidence')
    .insert([{
      test_id: testId,
      photo_url: photoUrl,
      notes: notes || null,
      uploaded_by: c.get('userEmail') ?? 'unknown',
      category,
      idempotency_key: effectiveIdempotencyKey,
      content_hash: contentHash
    }])
    .select('*');

  if (insertError) {
    if (idempotencyKey && insertError.code === '23505') {
      const raced = await findExisting();
      if (raced.row?.content_hash === contentHash && evidenceMetadataMatches(raced.row, category, notes)) {
        return c.json({ ...raced.row, duplicate: true, integrity_status: 'verified' }, 200);
      }
      if (createdObject) await serviceSupabase.storage.from(BUCKET).remove([filePath]);
      return c.json({ error: 'Idempotency key was already used with different evidence content' }, 409);
    }
    if (createdObject) await serviceSupabase.storage.from(BUCKET).remove([filePath]);
    return c.json({ error: insertError.message }, 500);
  }

  await writeAuditLog(
    c.get('userEmail') ?? 'unknown',
    `Uploaded ${category} evidence photo for test ${testId}`,
    testId
  );

  return c.json({ ...(inserted?.[0] ?? {}), integrity_status: 'verified' }, 201);
});

export default router;
