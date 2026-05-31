import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { writeAuditLog } from '../utilities/auditLog';
import { asyncHandler } from '../asyncHandler';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const BUCKET = 'evidence';

router.get('/:testId', requireAuth, async (req, res) => {
  const testId = String(req.params.testId);

  const { data, error } = await serviceSupabase
    .from('evidence')
    .select('*')
    .eq('test_id', testId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('evidence') || error.code === '42P01') {
      return res.status(503).json({
        error: 'Evidence table is not set up. Run the evidence SQL script in your Supabase SQL Editor.'
      });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json(data ?? []);
});

router.post('/:testId', requireAuth, upload.single('photo'), asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const testId = String(req.params.testId);
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

  if (!req.file) {
    return res.status(400).json({ error: 'Photo file is required' });
  }

  const { data: testExists } = await serviceSupabase
    .from('tests')
    .select('id')
    .eq('id', testId)
    .limit(1);

  if (!testExists?.length) {
    return res.status(404).json({ error: 'Test record not found' });
  }

  const ext = req.file.originalname.split('.').pop() || 'jpg';
  const filePath = `${testId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await serviceSupabase.storage
    .from(BUCKET)
    .upload(filePath, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

  if (uploadError) {
    return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
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
      uploaded_by: authReq.userEmail ?? 'unknown'
    }])
    .select('*');

  if (insertError) {
    await serviceSupabase.storage.from(BUCKET).remove([filePath]);
    return res.status(500).json({ error: insertError.message });
  }

  await writeAuditLog(
    authReq.userEmail ?? 'unknown',
    `Uploaded evidence photo for test ${testId}`,
    testId
  );

  return res.status(201).json(inserted?.[0] ?? null);
}));

export default router;
