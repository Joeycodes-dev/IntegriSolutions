import { Hono } from 'hono';
import type { AppEnv } from './env';
import { securityHeaders, corsMiddleware, requestLogger } from './middleware/security';
import { apiLimiter, authLimiter, syncLimiter, verifyLimiter, geocodeLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import testsRoutes from './routes/tests';
import syncRoutes from './routes/sync';
import adminRoutes from './routes/admin';
import supervisorRoutes from './routes/supervisor';
import evidenceRoutes from './routes/evidence';
import invalidationsRoutes from './routes/invalidations';
import scanRoutes from './routes/scan';
import shiftsRoutes from './routes/shifts';
import publicVerificationRoutes from './routes/publicVerification';
import configRoutes from './routes/config';
import chatRoutes from './routes/chat';
import roadOffenceRoutes from './routes/roadOffences';
import alertsRoutes from './routes/alerts';
import geocodeRoutes from './routes/geocode';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', securityHeaders);
  app.use('*', corsMiddleware);
  app.use('*', requestLogger);

  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  app.use('/api/public/*', verifyLimiter);
  app.route('/api/public', publicVerificationRoutes);

  app.use('/api/*', apiLimiter);
  app.use('/api/auth/*', authLimiter);
  app.route('/api/auth', authRoutes);
  app.route('/api/profile', profileRoutes);
  app.route('/api/tests', testsRoutes);
  app.use('/api/sync/*', syncLimiter);
  app.route('/api/sync', syncRoutes);
  app.route('/api/admin', adminRoutes);
  app.route('/api/supervisor', supervisorRoutes);
  app.route('/api/evidence', evidenceRoutes);
  app.route('/api/invalidations', invalidationsRoutes);
  app.route('/api/scan', scanRoutes);
  app.route('/api/shifts', shiftsRoutes);
  app.route('/api/config', configRoutes);
  app.route('/api/chat', chatRoutes);
  app.route('/api/road-offences', roadOffenceRoutes);
  app.route('/api/alerts', alertsRoutes);
  app.use('/api/geocode/*', geocodeLimiter);
  app.route('/api/geocode', geocodeRoutes);

  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.onError((err, c) => {
    console.error('[api] unhandled error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return c.json({ error: message }, 500);
  });

  return app;
}
