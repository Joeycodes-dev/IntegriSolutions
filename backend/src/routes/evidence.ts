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

const EVIDENCE_CATEGORIES = [
  'licence_front',
  'breathalyser_screen',
  'vehicle',
  'scene_note',
  'signature_witness'
] as const;

function normalizeCategory(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return (EVIDENCE_CATEGORIES as readonly string[]).includes(candidate) ? candidate : 'vehicle';
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
      return c.json({ error: 'Only image files are allowed' }, 500);
    }
    if (file && file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'File too large' }, 500);
    }
  } else {
    body = await readJson(c);
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const category = normalizeCategory(body.category);

  if (!file) {
    return c.json({ error: 'Photo file is required' }, 400);
  }

  const { data: testExists } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .limit(1);

  if (!testExists?.length) {
    return c.json({ error: 'Test record not found' }, 404);
  }

  const ext = file.originalname.split('.').pop() || 'jpg';
  const filePath = `${testId}/${category}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await serviceSupabase.storage
    .from(BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (uploadError) {
    return c.json({ error: `Storage upload failed: ${uploadError.message}` }, 500);
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
      category
    }])
    .select('*');

  if (insertError) {
    await serviceSupabase.storage.from(BUCKET).remove([filePath]);
    return c.json({ error: insertError.message }, 500);
  }

  await writeAuditLog(
    c.get('userEmail') ?? 'unknown',
    `Uploaded ${category} evidence photo for test ${testId}`,
    testId
  );

  return c.json(inserted?.[0] ?? null, 201);
});

export default router;
