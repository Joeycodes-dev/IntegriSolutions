import { Router } from 'express';
import { requireAdmin, type AdminRequest } from '../../middleware/requireAdmin';
import { asyncHandler } from '../../asyncHandler';
import {
  getAdminConfig,
  updateAdminSettings,
  SettingsValidationError,
  SettingsConflictError
} from '../../config/systemSettings';

const router = Router();

router.use(requireAdmin);

router.get('/', asyncHandler(async (_req, res) => {
  return res.json(await getAdminConfig());
}));

router.patch('/', asyncHandler(async (req, res) => {
  const authReq = req as unknown as AdminRequest;
  const body = (req.body ?? {}) as { expectedRevision?: unknown; values?: unknown };

  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return res.status(400).json({ error: 'expectedRevision must be a positive integer' });
  }

  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
    return res.status(400).json({ error: 'values must be an object of setting key/value pairs' });
  }

  try {
    const config = await updateAdminSettings(
      authReq.userEmail ?? 'unknown',
      expectedRevision,
      body.values as Record<string, unknown>
    );
    return res.json(config);
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return res.status(400).json({ error: err.message });
    }
    if (err instanceof SettingsConflictError) {
      return res.status(409).json({
        error: err.message,
        currentRevision: err.currentRevision
      });
    }
    throw err;
  }
}));

export default router;
