import { Hono } from 'hono';
import request from '../helpers/request';

jest.mock('../../src/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

import scanRoutes from '../../src/routes/scan';
import { supabase } from '../../src/supabase';
import type { AppEnv } from '../../src/env';

const app = new Hono<AppEnv>();
app.route('/api/scan', scanRoutes);

const LICENCE_TEXT = [
  'REPUBLIC OF SOUTH AFRICA',
  'DRIVING LICENCE',
  'SURNAME: MALUNGA',
  'INITIALS: BP',
  'ID NO: 9001015009087',
  'LICENCE NUMBER: H12345678',
  'VALID 12/05/2019 - 12/05/2024',
  'DATE OF BIRTH: 1990/01/01',
].join('\n');

describe('Scan Route (on-device OCR text parsing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'officer-1', email: 'officer@example.com' } },
      error: null,
    });
  });

  it('returns 401 without authentication', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await request(app).post('/api/scan').send({ text: LICENCE_TEXT });
    expect(response.status).toBe(401);
  });

  it('returns 400 when no OCR text is supplied', async () => {
    const response = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('A front-of-licence text scan is required.');
  });

  it('returns 413 when the OCR text exceeds the size limit', async () => {
    const response = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'x'.repeat(200_001) });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Licence scan text is too large.');
  });

  it('parses a valid SA licence text into driver fields', async () => {
    const response = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: LICENCE_TEXT });

    expect(response.status).toBe(200);
    expect(response.body.initials).toBe('BP');
    expect(response.body.surname).toBe('MALUNGA');
    expect(response.body.idNumber).toBe('9001015009087');
    expect(response.body.licenseNumber).toBe('H12345678');
    expect(response.body.expiryDate).toBe('2024-05-12');
    expect(response.body._ocr.engine).toBe('ml-kit');
    expect(response.body._ocr.usedPaidFallback).toBe(false);
    expect(response.body._ocr.fallbackReason).toBeNull();
    expect(response.body._ocr.passes).toHaveLength(1);
    expect(response.body._ocr.passes[0].name).toBe('mlkit');
    expect(response.body._ocr.passes[0].confidence).toBe(0.85);
    expect(response.body._ocr.overallConfidence).toBeGreaterThanOrEqual(0.68);
  });

  it('returns 422 with the partial parse when fields cannot be read', async () => {
    const response = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer valid-token')
      .send({ text: 'not a driving licence' });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe(
      'Low confidence capture. Retake in good light, avoid glare, and fill the frame with the card.'
    );
    expect(response.body.partial._ocr.engine).toBe('ml-kit');
    expect(response.body.partial._ocr.overallConfidence).toBeLessThan(0.68);
  });
});
