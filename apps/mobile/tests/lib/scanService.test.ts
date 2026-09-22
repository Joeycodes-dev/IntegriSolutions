jest.mock('expo-ai-kit', () => ({
  prepareVision: jest.fn(),
  recognizeText: jest.fn()
}));

jest.mock('../../src/services/auth', () => ({
  getAccessToken: jest.fn()
}));

jest.mock('../../src/services/constants', () => ({
  API_BASE_URL: 'http://localhost:4000/api'
}));

import { prepareVision, recognizeText } from 'expo-ai-kit';
import { getAccessToken } from '../../src/services/auth';
import { scanDriverLicense } from '../../src/services/scanService';

describe('services/scanService (on-device OCR, backend parsing)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAccessToken as jest.Mock).mockResolvedValue('tok-123');
    (prepareVision as jest.Mock).mockResolvedValue(undefined);
    (recognizeText as jest.Mock).mockResolvedValue({ text: 'SURNAME: MALUNGA', blocks: [] });
  });

  it('runs on-device OCR and posts the extracted text (not the image) to /scan', async () => {
    const expected = { surname: 'MALUNGA' };
    (global.fetch as any) = jest.fn().mockResolvedValue({ ok: true, json: async () => expected });

    const result = await scanDriverLicense('file:///licence.jpg', { retry: true });

    expect(prepareVision).toHaveBeenCalledWith({ features: ['text-recognition'], languages: ['en'] });
    expect(recognizeText).toHaveBeenCalledWith({ uri: 'file:///licence.jpg' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/scan',
      expect.objectContaining({ method: 'POST' })
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok-123');
    expect(JSON.parse(init.body)).toEqual({ text: 'SURNAME: MALUNGA', retry: true });
    expect(JSON.parse(init.body).base64Image).toBeUndefined();
    expect(result).toEqual(expected);
  });

  it('fails before OCR when there is no access token', async () => {
    (getAccessToken as jest.Mock).mockResolvedValue(null);
    (global.fetch as any) = jest.fn();

    await expect(scanDriverLicense('file:///licence.jpg')).rejects.toThrow('You must be signed in to scan a licence.');
    expect(recognizeText).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails without calling the backend when OCR reads no text', async () => {
    (recognizeText as jest.Mock).mockResolvedValue({ text: '   ', blocks: [] });
    (global.fetch as any) = jest.fn();

    await expect(scanDriverLicense('file:///licence.jpg')).rejects.toThrow('No text could be read');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('wraps on-device OCR failures with a readable message', async () => {
    (recognizeText as jest.Mock).mockRejectedValue(new Error('VISION_FAILED'));
    (global.fetch as any) = jest.fn();

    await expect(scanDriverLicense('file:///licence.jpg')).rejects.toThrow('On-device OCR failed: VISION_FAILED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces the backend error message on non-ok responses', async () => {
    (global.fetch as any) = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Low confidence capture.' })
    });

    await expect(scanDriverLicense('file:///licence.jpg')).rejects.toThrow('Low confidence capture.');
  });
});
