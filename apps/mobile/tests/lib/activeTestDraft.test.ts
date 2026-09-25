import {
  draftOwnerForProfile,
  parseActiveTestDraft,
  type ActiveTestDraftPayload,
} from '../../src/lib/activeTestDraft';

const owner = draftOwnerForProfile({
  uid: 'officer-uid-1',
  officerId: 23,
});

function makeDraft(overrides: Partial<ActiveTestDraftPayload> = {}): ActiveTestDraftPayload {
  return {
    kind: 'active-test',
    schemaVersion: 1,
    draftId: 'draft-1',
    plannedTestId: 'planned-1',
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:01:00.000Z',
    owner,
    step: 'reading',
    subjectSource: 'barcode',
    scannedData: {
      name: 'Test',
      surname: 'Officer',
      initials: 'TO',
      idNumber: '9001015800087',
      licenseNumber: 'DL123',
      dob: '1990-01-01',
      expiryDate: '2030-01-01',
      licenseCodes: 'B',
    },
    decryptedData: null,
    decryptError: null,
    officerNotes: 'Keep the officer notes together.',
    bacReading: '0.025',
    capturedDeviceEvidence: {
      transport: 'simulated',
      serial: 'TEST-1',
      calibrationVersion: 'mq3-v1',
      calibrationCleanAirResistanceOhms: 7500,
      sessionPeakRaw: 300,
      avgRaw: 280,
      raw: 290,
      capturedAt: '2026-09-24T10:00:30.000Z',
    },
    photoUri: null,
    attachments: [
      {
        id: 'attachment-1',
        category: 'licence_front',
        uri: 'file:///documents/active-test-drafts/draft-1/attachment-1.jpg',
      },
    ],
    selectedShift: null,
    policy: {
      key: 'professional',
      label: 'Professional Driver',
      limitG100ml: 0.02,
      limitMg1000ml: 0.2,
    },
    retest: null,
    autoWorkflow: false,
    pendingCapture: null,
    ...overrides,
  };
}

describe('active test draft payload', () => {
  it('round-trips the complete recovery payload', () => {
    const draft = makeDraft();
    expect(parseActiveTestDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it('rejects malformed decrypted data instead of allowing a render crash', () => {
    const draft = makeDraft({
      decryptedData: [] as never,
    });
    expect(() => parseActiveTestDraft(JSON.stringify(draft))).toThrow(/incomplete|damaged/i);
  });

  it('rejects duplicate evidence categories and invalid owner keys', () => {
    const duplicate = makeDraft({
      attachments: [
        {
          id: 'attachment-1',
          category: 'vehicle',
          uri: 'file:///one.jpg',
        },
        {
          id: 'attachment-2',
          category: 'vehicle',
          uri: 'file:///two.jpg',
        },
      ],
    });
    expect(() => parseActiveTestDraft(JSON.stringify(duplicate))).toThrow(/evidence/i);

    const wrongOwner = makeDraft({
      owner: { ...owner, ownerKey: 'officer:999' },
    });
    expect(() => parseActiveTestDraft(JSON.stringify(wrongOwner))).toThrow(/incomplete|damaged/i);
  });

  it('uses the UID rather than a shared fixture officer ID for local sessions', () => {
    expect(
      draftOwnerForProfile({ uid: 'local-one', officerId: 23 }),
    ).toEqual({
      ownerKey: 'uid:local-one',
      officerId: null,
      officerUid: 'local-one',
    });
  });
});
