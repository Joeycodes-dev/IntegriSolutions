import type { DeviceEvidencePayload } from '../services/breathalyzer';
import type { RoadblockShift } from '../services/shifts';
import type { DecryptedLicenseData } from './licenseDecryptor';
import type { DriverLicenseData } from '../types';
import type { EvidenceCategory } from './evidenceCategories';
import type { ResolvedDriverPolicy } from './driverPolicy';

export const ACTIVE_TEST_DRAFT_SCHEMA_VERSION = 1;
const MAX_DRAFT_JSON_BYTES = 512 * 1024;
const DRAFT_EVIDENCE_CATEGORIES = new Set([
  'licence_front',
  'breathalyser_screen',
  'vehicle',
  'scene_note',
  'signature_witness',
]);
const DEVICE_TRANSPORTS = new Set(['ble', 'bluetooth_classic', 'simulated']);

export type ActiveTestDraftStep = 'scan' | 'reading';
export type ActiveTestSubjectSource = 'barcode' | 'photo' | 'developer';

export type DraftOwner = {
  ownerKey: string;
  officerId: number | null;
  officerUid: string | null;
};

export type ActiveTestDraftAttachment = {
  id: string;
  category: EvidenceCategory;
  uri: string;
  idempotencyKey?: string;
  contentHash?: string | null;
};

export type ActiveTestPendingCapture =
  | { kind: 'licence_front' }
  | { kind: 'evidence'; category: EvidenceCategory };

export type ActiveTestDraftContent = Omit<
  ActiveTestDraftPayload,
  'kind' | 'schemaVersion' | 'draftId' | 'plannedTestId' | 'createdAt' | 'updatedAt' | 'owner'
>;

export type ActiveTestDraftPayload = {
  kind: 'active-test';
  schemaVersion: typeof ACTIVE_TEST_DRAFT_SCHEMA_VERSION;
  draftId: string;
  plannedTestId: string;
  createdAt: string;
  updatedAt: string;
  owner: DraftOwner;
  step: ActiveTestDraftStep;
  subjectSource: ActiveTestSubjectSource;
  scannedData: DriverLicenseData | null;
  decryptedData: DecryptedLicenseData | null;
  decryptError: string | null;
  officerNotes: string;
  bacReading: string;
  capturedDeviceEvidence: DeviceEvidencePayload | null;
  photoUri: string | null;
  attachments: ActiveTestDraftAttachment[];
  selectedShift: RoadblockShift | null;
  policy: ResolvedDriverPolicy | null;
  retest: {
    originalTestId: string;
    driver: DriverLicenseData;
  } | null;
  autoWorkflow: boolean;
  pendingCapture?: ActiveTestPendingCapture | null;
};

export function draftOwnerForProfile(profile: {
  uid: string;
  officerId?: number | null;
}): DraftOwner {
  // Local developer profiles may reuse a fixture officerId. Their UID is the
  // only stable distinction between separate local sessions.
  if (profile.uid.startsWith('local-')) {
    return {
      ownerKey: `uid:${profile.uid}`,
      officerId: null,
      officerUid: profile.uid,
    };
  }
  if (Number.isFinite(profile.officerId) && profile.officerId != null) {
    return {
      ownerKey: `officer:${profile.officerId}`,
      officerId: profile.officerId,
      officerUid: profile.uid,
    };
  }
  return {
    ownerKey: `uid:${profile.uid}`,
    officerId: null,
    officerUid: profile.uid,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isDriverData(value: unknown): value is DriverLicenseData {
  if (!isObject(value)) return false;
  return [
    'name',
    'surname',
    'initials',
    'idNumber',
    'licenseNumber',
    'dob',
    'expiryDate',
    'licenseCodes',
  ].every((key) => isString(value[key]));
}

function isDecryptedData(value: unknown): value is DecryptedLicenseData {
  if (!isObject(value)) return false;
  return (
    isStringArray(value.vehicleCodes) &&
    isString(value.surname) &&
    isString(value.initials) &&
    (value.prdpCode == null || isString(value.prdpCode)) &&
    (value.idCountryOfIssue == null || isString(value.idCountryOfIssue)) &&
    (value.licenseCountryOfIssue == null || isString(value.licenseCountryOfIssue)) &&
    isStringArray(value.vehicleRestrictions) &&
    isStringArray(value.printableStrings) &&
    isString(value.rawHex)
  );
}

function isAttachment(value: unknown): value is ActiveTestDraftAttachment {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.category) &&
    isNonEmptyString(value.uri) &&
    (value.idempotencyKey == null || isNonEmptyString(value.idempotencyKey)) &&
    (value.contentHash == null || (isString(value.contentHash) && /^[a-f0-9]{64}$/i.test(value.contentHash)))
  );
}

function isDeviceEvidence(value: unknown): value is DeviceEvidencePayload {
  if (!isObject(value)) return false;
  return (
    isString(value.transport) &&
    DEVICE_TRANSPORTS.has(value.transport) &&
    (value.serial == null || isString(value.serial)) &&
    isNonEmptyString(value.calibrationVersion) &&
    isFiniteNumber(value.calibrationCleanAirResistanceOhms) &&
    value.calibrationCleanAirResistanceOhms >= 0 &&
    isFiniteNumber(value.sessionPeakRaw) &&
    isFiniteNumber(value.avgRaw) &&
    isFiniteNumber(value.raw) &&
    isIsoDate(value.capturedAt)
  );
}

function isPolicy(value: unknown): value is ResolvedDriverPolicy {
  if (!isObject(value)) return false;
  return (
    (value.key === 'general' || value.key === 'professional') &&
    isNonEmptyString(value.label) &&
    isFiniteNumber(value.limitG100ml) &&
    value.limitG100ml >= 0 &&
    isFiniteNumber(value.limitMg1000ml) &&
    value.limitMg1000ml >= 0
  );
}

function isShift(value: unknown): value is RoadblockShift {
  if (!isObject(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.roadblockName) &&
    isNonEmptyString(value.station) &&
    isNonEmptyString(value.supervisorEmail) &&
    (value.supervisorName == null || isString(value.supervisorName)) &&
    ['scheduled', 'active', 'closed', 'cancelled'].includes(String(value.status)) &&
    isIsoDate(value.startsAt) &&
    isIsoDate(value.endsAt) &&
    (value.centerLat == null || isFiniteNumber(value.centerLat)) &&
    (value.centerLng == null || isFiniteNumber(value.centerLng)) &&
    (value.radiusMeters == null || isFiniteNumber(value.radiusMeters)) &&
    (value.notes == null || isString(value.notes)) &&
    (value.assignmentStatus == null || isString(value.assignmentStatus)) &&
    isIsoDate(value.createdAt) &&
    isIsoDate(value.updatedAt)
  );
}

function isOwner(value: unknown): value is DraftOwner {
  if (!isObject(value)) return false;
  if (
    !isNonEmptyString(value.ownerKey) ||
    (value.officerId != null && !isFiniteNumber(value.officerId)) ||
    (value.officerUid != null && !isNonEmptyString(value.officerUid))
  ) {
    return false;
  }
  if (value.officerId != null) {
    return value.ownerKey === `officer:${value.officerId}` && isNonEmptyString(value.officerUid);
  }
  return isNonEmptyString(value.officerUid) && value.ownerKey === `uid:${value.officerUid}`;
}

function isPendingCapture(value: unknown): value is ActiveTestPendingCapture {
  if (!isObject(value)) return false;
  if (value.kind === 'licence_front') return true;
  return (
    value.kind === 'evidence' &&
    typeof value.category === 'string' &&
    DRAFT_EVIDENCE_CATEGORIES.has(value.category as EvidenceCategory)
  );
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function parseActiveTestDraft(raw: string): ActiveTestDraftPayload {
  if (utf8ByteLength(raw) > MAX_DRAFT_JSON_BYTES) {
    throw new Error('The recovered test draft is too large to restore safely.');
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('The recovered test draft is damaged and cannot be restored.');
  }
  if (!isObject(value) || value.kind !== 'active-test') {
    throw new Error('The recovered test draft has an unsupported format.');
  }
  if (value.schemaVersion !== ACTIVE_TEST_DRAFT_SCHEMA_VERSION) {
    throw new Error(`Draft version ${String(value.schemaVersion)} is not supported by this app version.`);
  }
  if (
    !isNonEmptyString(value.draftId) ||
    !isNonEmptyString(value.plannedTestId) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt) ||
    !isOwner(value.owner) ||
    (value.step !== 'scan' && value.step !== 'reading') ||
    !['barcode', 'photo', 'developer'].includes(String(value.subjectSource)) ||
    (value.scannedData != null && !isDriverData(value.scannedData)) ||
    (value.decryptedData != null && !isDecryptedData(value.decryptedData)) ||
    (value.decryptError != null && !isString(value.decryptError)) ||
    !isString(value.officerNotes) ||
    !isString(value.bacReading) ||
    (value.capturedDeviceEvidence != null && !isDeviceEvidence(value.capturedDeviceEvidence)) ||
    (value.photoUri != null && !isNonEmptyString(value.photoUri)) ||
    !Array.isArray(value.attachments) ||
    !value.attachments.every(isAttachment) ||
    (value.selectedShift != null && !isShift(value.selectedShift)) ||
    (value.policy != null && !isPolicy(value.policy)) ||
    (value.retest != null && (
      !isObject(value.retest) ||
      !isNonEmptyString(value.retest.originalTestId) ||
      !isDriverData(value.retest.driver)
    )) ||
    typeof value.autoWorkflow !== 'boolean' ||
    (value.pendingCapture != null && !isPendingCapture(value.pendingCapture))
  ) {
    throw new Error('The recovered test draft is incomplete or damaged.');
  }

  const attachments = value.attachments as ActiveTestDraftAttachment[];
  if (
    attachments.length > DRAFT_EVIDENCE_CATEGORIES.size ||
    new Set(attachments.map((item) => item.id)).size !== attachments.length ||
    new Set(attachments.map((item) => item.category)).size !== attachments.length ||
    attachments.some((item) => !DRAFT_EVIDENCE_CATEGORIES.has(item.category))
  ) {
    throw new Error('The recovered test draft contains invalid evidence attachments.');
  }

  return {
    kind: 'active-test',
    schemaVersion: ACTIVE_TEST_DRAFT_SCHEMA_VERSION,
    draftId: value.draftId,
    plannedTestId: value.plannedTestId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    owner: value.owner,
    step: value.step,
    subjectSource: value.subjectSource as ActiveTestSubjectSource,
    scannedData: value.scannedData as DriverLicenseData | null,
    decryptedData: value.decryptedData as DecryptedLicenseData | null,
    decryptError: value.decryptError as string | null,
    officerNotes: value.officerNotes.slice(0, 10_000),
    bacReading: value.bacReading.slice(0, 32),
    capturedDeviceEvidence: value.capturedDeviceEvidence as DeviceEvidencePayload | null,
    photoUri: value.photoUri as string | null,
    attachments: value.attachments as ActiveTestDraftAttachment[],
    selectedShift: value.selectedShift as RoadblockShift | null,
    policy: value.policy as ResolvedDriverPolicy | null,
    retest: value.retest as ActiveTestDraftPayload['retest'],
    autoWorkflow: value.autoWorkflow,
    pendingCapture: (value.pendingCapture as ActiveTestPendingCapture | null | undefined) ?? null,
  };
}
