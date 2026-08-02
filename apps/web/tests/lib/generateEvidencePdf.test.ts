import { describe, it, expect, vi, beforeEach } from 'vitest';

const { jsPDFMock } = vi.hoisted(() => ({ jsPDFMock: vi.fn() }));

vi.mock('jspdf', () => ({ jsPDF: jsPDFMock }));

vi.mock('qrcode', () => ({ toDataURL: vi.fn() }));

vi.mock('../../src/services/api', () => ({
  getAnnotations: vi.fn(),
  getEvidence: vi.fn(),
  getVerificationTokens: vi.fn()
}));

import * as QRCode from 'qrcode';
import {
  generateEvidencePdf,
  generateWeeklyEvidencePdf
} from '../../src/lib/generateEvidencePdf';
import { getAnnotations, getEvidence, getVerificationTokens } from '../../src/services/api';
import type { TestRecord, VerificationTokenRecord } from '../../src/types';

class FakeDoc {
  addPage = vi.fn();
  save = vi.fn();
  addImage = vi.fn();
  setFont = vi.fn();
  setFontSize = vi.fn();
  setTextColor = vi.fn();
  setDrawColor = vi.fn();
  setLineWidth = vi.fn();
  setFillColor = vi.fn();
  text = vi.fn();
  line = vi.fn();
  roundedRect = vi.fn();
  splitTextToSize = vi.fn((value: string) => [value]);
}

const baseTest: TestRecord = {
  id: 'test-123',
  officerId: 1,
  officerName: 'John Doe',
  badgeNumber: '12345',
  driverName: 'Jane Smith',
  driverId: '9876543210123',
  bacReading: 0.08,
  result: 'fail',
  createdAt: '2026-05-30T10:00:00Z',
  hash: 'abc123',
  hashValid: true
};

const verification: VerificationTokenRecord = {
  testId: 'test-123',
  token: 'tok-abc123',
  referenceId: 'IS-2026-05-30-001',
  hash: 'abc123',
  hashStatus: 'verified',
  timestamp: '2026-05-30T10:00:00Z',
  officerBadge: '12345',
  issuedAt: '2026-05-30T12:00:00Z'
};

describe('generateEvidencePdf', () => {
  let doc: FakeDoc;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new FakeDoc();
    jsPDFMock.mockImplementation(function () {
      return doc;
    });
    (getAnnotations as any).mockResolvedValue([]);
    (getEvidence as any).mockResolvedValue([]);
    (QRCode.toDataURL as any).mockResolvedValue('data:image/png;base64,FAKEQR');
  });

  it('requests one verification token for the record', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);

    await generateEvidencePdf(baseTest);

    expect(getVerificationTokens).toHaveBeenCalledWith(['test-123']);
  });

  it('draws a QR pointing at the public verification URL and saves the PDF', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);

    await generateEvidencePdf(baseTest);

    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      expect.stringContaining('/#/verify/tok-abc123'),
      expect.objectContaining({ errorCorrectionLevel: 'H' })
    );
    expect(doc.addImage).toHaveBeenCalledWith(
      'data:image/png;base64,FAKEQR',
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      undefined,
      'FAST'
    );
    expect(doc.save).toHaveBeenCalledWith('integriscan-IS-2026-05-30-001.pdf');
  });

  it('fails closed when token issuance fails', async () => {
    (getVerificationTokens as any).mockRejectedValue(new Error('network down'));

    await expect(generateEvidencePdf(baseTest)).rejects.toThrow('network down');
    expect(jsPDFMock).not.toHaveBeenCalled();
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('fails closed when no token is returned', async () => {
    (getVerificationTokens as any).mockResolvedValue([]);

    await expect(generateEvidencePdf(baseTest)).rejects.toThrow(/verification link/i);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('fails closed when QR generation fails', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);
    (QRCode.toDataURL as any).mockRejectedValue(new Error('qr busted'));

    await expect(generateEvidencePdf(baseTest)).rejects.toThrow(/QR code/i);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('uses the server-issued hash status and hash in the PDF', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);

    await generateEvidencePdf(baseTest);

    const textCalls = doc.text.mock.calls.map((call) => String(call[0]));
    expect(textCalls.some((t) => t.includes('Status: VERIFIED'))).toBe(true);
    expect(textCalls.some((t) => t.includes('abc123'))).toBe(true);
    expect(textCalls.some((t) => t.includes('IS-2026-05-30-001'))).toBe(true);
  });

  it('does not render an empty evidence section when no photos exist', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);

    await generateEvidencePdf(baseTest);

    const evidenceHeadings = doc.text.mock.calls.filter(([value]) => value === 'Evidence');
    expect(evidenceHeadings).toHaveLength(0);
  });

  it('renders exactly one evidence heading when photos exist', async () => {
    (getVerificationTokens as any).mockResolvedValue([verification]);
    (getEvidence as any).mockResolvedValue([
      {
        id: 1,
        test_id: 'test-123',
        photo_url: 'https://cdn.example/photo.jpg',
        notes: null,
        uploaded_by: 'officer@example.com',
        category: 'vehicle',
        created_at: '2026-05-30T10:00:00Z'
      }
    ]);

    await generateEvidencePdf(baseTest);

    const evidenceHeadings = doc.text.mock.calls.filter(([value]) => value === 'Evidence');
    expect(evidenceHeadings).toHaveLength(1);
  });
});

describe('generateWeeklyEvidencePdf', () => {
  let doc: FakeDoc;

  beforeEach(() => {
    vi.clearAllMocks();
    doc = new FakeDoc();
    jsPDFMock.mockImplementation(function () {
      return doc;
    });
    (getAnnotations as any).mockResolvedValue([]);
    (getEvidence as any).mockResolvedValue([]);
    (QRCode.toDataURL as any).mockResolvedValue('data:image/png;base64,FAKEQR');
  });

  it('issues tokens for the whole batch in one request', async () => {
    const secondTest = { ...baseTest, id: 'test-456', createdAt: '2026-05-31T10:00:00Z' };
    (getVerificationTokens as any).mockResolvedValue([
      verification,
      { ...verification, testId: 'test-456', token: 'tok-456', referenceId: 'IS-2026-05-31-456' }
    ]);

    await generateWeeklyEvidencePdf([baseTest, secondTest], { from: 'a', to: 'b' });

    expect(getVerificationTokens).toHaveBeenCalledWith(['test-123', 'test-456']);
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(QRCode.toDataURL).toHaveBeenCalledTimes(2);
    expect(doc.save).toHaveBeenCalledWith('integriscan-weekly-report-a-to-b.pdf');
  });

  it('draws a distinct QR per page', async () => {
    const secondTest = { ...baseTest, id: 'test-456', createdAt: '2026-05-31T10:00:00Z' };
    (getVerificationTokens as any).mockResolvedValue([
      verification,
      { ...verification, testId: 'test-456', token: 'tok-456', referenceId: 'IS-2026-05-31-456' }
    ]);

    await generateWeeklyEvidencePdf([baseTest, secondTest]);

    expect((QRCode.toDataURL as any).mock.calls[0][0]).toContain('/#/verify/tok-abc123');
    expect((QRCode.toDataURL as any).mock.calls[1][0]).toContain('/#/verify/tok-456');
  });

  it('fails closed when a batch token is missing', async () => {
    const secondTest = { ...baseTest, id: 'test-456', createdAt: '2026-05-31T10:00:00Z' };
    (getVerificationTokens as any).mockResolvedValue([verification]);

    await expect(generateWeeklyEvidencePdf([baseTest, secondTest])).rejects.toThrow(
      /verification link/i
    );
    expect(jsPDFMock).not.toHaveBeenCalled();
  });
});
