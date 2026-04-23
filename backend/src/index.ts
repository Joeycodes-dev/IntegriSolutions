import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import testsRoutes from './routes/tests';
import scanRoutes from './routes/scan';

const app = express();
const port = process.env.PORT ?? '4000';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';

app.use(helmet());
app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/scan', scanRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(Number(port), () => {
  console.log(`Backend API running on http://localhost:${port}`);
});
