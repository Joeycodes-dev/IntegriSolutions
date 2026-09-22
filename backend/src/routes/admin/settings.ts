import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { requireAdmin } from '../../middleware/requireAdmin';
import { readJson } from '../../utilities/jsonBody';
import {
  getAdminConfig,
  updateAdminSettings,
  SettingsValidationError,
  SettingsConflictError
} from '../../config/systemSettings';

const router = new Hono<AppEnv>();

router.use('*', requireAdmin);

router.get('/', async (c) => {
  return c.json(await getAdminConfig());
});

router.patch('/', async (c) => {
  const body = await readJson<{ expectedRevision?: unknown; values?: unknown }>(c);

  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    return c.json({ error: 'expectedRevision must be a positive integer' }, 400);
  }

  if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) {
    return c.json({ error: 'values must be an object of setting key/value pairs' }, 400);
  }

  try {
    const config = await updateAdminSettings(
      c.get('userEmail') ?? 'unknown',
      expectedRevision,
      body.values as Record<string, unknown>
    );
    return c.json(config);
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof SettingsConflictError) {
      return c.json(
        {
          error: err.message,
          currentRevision: err.currentRevision
        },
        409
      );
    }
    throw err;
  }
});

export default router;
