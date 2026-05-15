import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import testsRoutes from './routes/tests';
import syncRoutes from './routes/sync';

const app = express();
const port = process.env.PORT ?? '4000';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

app.use(helmet());
app.use(cors({ origin: frontendUrl, credentials: true }));
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

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(Number(port), '0.0.0.0', () => {
  const addr = server.address();
  const host = typeof addr === 'string' ? addr : addr?.address;
  console.log(`Backend API running on http://${host}:${port}`);
});
