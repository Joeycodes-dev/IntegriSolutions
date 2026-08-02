import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const wrappedJsPDFBox = vi.hoisted(() => ({ value: null as any }));

vi.mock('jspdf', async () => {
  const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
  class WrappedJsPDF extends actual.jsPDF {
    static instances: WrappedJsPDF[] = [];
    yPositions: number[] = [];
    addImageCalls: unknown[][] = [];

    constructor(...args: any[]) {
      super(...args);
      const baseText = this.text.bind(this);
      this.text = ((...t: any[]) => {
        if (typeof t[2] === 'number') this.yPositions.push(t[2]);
        return baseText(...t);
      }) as typeof this.text;

      const baseAddImage = this.addImage.bind(this);
      this.addImage = ((...a: any[]) => {
        this.addImageCalls.push(a);
        return baseAddImage(...a);
      }) as typeof this.addImage;

      this.save = (() => undefined) as typeof this.save;

      WrappedJsPDF.instances.push(this);
    }
  }
  wrappedJsPDFBox.value = WrappedJsPDF;
  return { jsPDF: WrappedJsPDF };
});

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  )
}));

vi.mock('../../src/services/api', () => ({
  getAnnotations: vi.fn(),
  getEvidence: vi.fn(),
  getVerificationTokens: vi.fn()
}));

import { generateEvidencePdf } from '../../src/lib/generateEvidencePdf';
import { getAnnotations, getEvidence, getVerificationTokens } from '../../src/services/api';
import type { TestRecord, VerificationTokenRecord } from '../../src/types';

const verification: VerificationTokenRecord = {
  testId: 'test-123',
  token: 'tok-probe',
  referenceId: 'IS-2026-05-30-001',
  hash: 'a'.repeat(64),
  hashStatus: 'verified',
  timestamp: '2026-05-30T10:00:00Z',
  officerBadge: '12345',
  issuedAt: '2026-05-30T12:00:00Z'
};

function makeTest(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id: 'test-123',
    officerId: 1,
    officerName: 'John Doe',
    badgeNumber: '12345',
    driverName: 'Jane Smith',
    driverId: '9876543210123',
    bacReading: 0.08,
    result: 'fail',
    createdAt: '2026-05-30T10:00:00Z',
    hash: 'a'.repeat(64),
    hashValid: true,
    location: JSON.stringify({
      roadblock: 'N1 Midrand roadblock',
      station: 'Midrand SAPS',
      officerRank: 'Constable',
      officerNotes: 'Driver smelled of alcohol. ' + 'A very long note repeated. '.repeat(6)
    }),
    ...overrides
  };
}

describe('PDF layout (real jsPDF engine)', () => {
  let originalFetch: typeof fetch;
  let originalCreateObjectURL: typeof URL.createObjectURL | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (() => 'blob:fake') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    wrappedJsPDFBox.value.instances = [];
    (getAnnotations as any).mockResolvedValue([]);
    (getEvidence as any).mockResolvedValue([]);
    (getVerificationTokens as any).mockResolvedValue([verification]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL ?? URL.createObjectURL;
  });

  it('renders a no-photo record on a single page, all content within bounds', async () => {
    await generateEvidencePdf(makeTest());

    const doc = wrappedJsPDFBox.value.instances[0];
    expect(doc.getNumberOfPages()).toBe(1);
    expect(Math.max(...doc.yPositions)).toBeLessThanOrEqual(297);

    const text = doc.yPositions.length;
    expect(text).toBeGreaterThan(20);
  });

  it('keeps integrity and annotations on the page even with photos and annotations', async () => {
    (getEvidence as any).mockResolvedValue([
      { id: 1, test_id: 'test-123', photo_url: 'https://cdn.example/a.jpg', notes: null, uploaded_by: 'x', category: 'vehicle', created_at: '2026-05-30T10:00:00Z' },
      { id: 2, test_id: 'test-123', photo_url: 'https://cdn.example/b.jpg', notes: null, uploaded_by: 'x', category: 'licence_front', created_at: '2026-05-30T10:00:00Z' },
      { id: 3, test_id: 'test-123', photo_url: 'https://cdn.example/c.jpg', notes: null, uploaded_by: 'x', category: 'breathalyser_screen', created_at: '2026-05-30T10:00:00Z' },
      { id: 4, test_id: 'test-123', photo_url: 'https://cdn.example/d.jpg', notes: null, uploaded_by: 'x', category: 'scene_note', created_at: '2026-05-30T10:00:00Z' }
    ]);
    (getAnnotations as any).mockResolvedValue([
      { id: 1, test_id: 'test-123', supervisor_email: 's@example.com', comment: 'Approved for court', status: 'approved', created_at: '2026-05-30T12:00:00Z' }
    ]);

    await generateEvidencePdf(makeTest());

    const doc = wrappedJsPDFBox.value.instances[0];
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(Math.max(...doc.yPositions)).toBeLessThanOrEqual(297);
  });

  it('draws the QR image into the document', async () => {
    await generateEvidencePdf(makeTest());

    const doc = wrappedJsPDFBox.value.instances[0];
    expect(doc.addImageCalls.length).toBeGreaterThanOrEqual(1);
    expect(String(doc.addImageCalls[0][0])).toContain('iVBORw0KGgo');
  });
});
