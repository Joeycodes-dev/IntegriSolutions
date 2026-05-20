import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const envFile = fs.existsSync(path.resolve(process.cwd(), '.env.local'))
  ? '.env.local'
  : '.env';
dotenv.config({ path: envFile });
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import testsRoutes from './routes/tests';
import syncRoutes from './routes/sync';
import adminRoutes from './routes/admin';
import supervisorRoutes from './routes/supervisor';

const app = express();
const port = process.env.PORT ?? '4000';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const allowedOrigins = new Set([
  frontendUrl,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173'
]);

app.use(helmet());
app.use(
  cors({
    origin: [...allowedOrigins],
    credentials: true
  })
);
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/supervisor', supervisorRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api] unhandled error:', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (!res.headersSent) {
    res.status(500).json({ error: message });
  }
});

const server = app.listen(Number(port), '0.0.0.0', () => {
  const addr = server.address();
  const host = typeof addr === 'string' ? addr : addr?.address;
  console.log(`Backend API running on http://${host}:${port}`);
});
