export type UserRole = 'officer' | 'supervisor' | 'admin';

export type AdminNavItem = 'users' | 'audit' | 'config';

export type SupervisorNavItem = 'dashboard' | 'logs' | 'cases' | 'officers' | 'shifts' | 'reports';

export type PdfAccessPolicy = 'admin_only' | 'admin_supervisor' | 'disabled';

export interface BacLimitSetting {
  key: 'general' | 'professional';
  label: string;
  limitG100ml: number;
  limitMg1000ml: number;
}

export interface AdminConfig {
  revision: number;
  updatedAt: string;
  updatedBy: string | null;
  auth: { sessionTimeoutMinutes: number };
  export: {
    pdfWatermarkEnabled: boolean;
    pdfWatermarkText: string;
    pdfAccess: PdfAccessPolicy;
  };
  alerts: {
    integrityFlagCount: number;
    failureRateChangePoints: number;
    roadblockMinimumTests: number;
    avgFailingBacMultiple: number;
  };
  bacLimits: BacLimitSetting[];
}

/** Role-safe runtime settings served to authenticated clients. */
export type RuntimeConfig = Omit<AdminConfig, 'revision' | 'updatedAt' | 'updatedBy'>;

export interface AuditLogEntry {
  id: number;
  auditId: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
}

export interface PortalUser {
  officerId: number;
  userId: string;
  name: string;
  email: string;
  role: string;
  roleId: number;
  station: string;
  status: string;
  createdAt: string;
  invitationExpiresAt?: string;
  inviteEmailSent?: boolean;
  inviteLink?: string;
  emailWarning?: string;
  /** Which profile table this portal user lives in. */
  source?: 'officer_users' | 'supervisor_users' | 'admin_users';
}

export interface UserProfile {
  uid: string;
  officerId?: number;
  email: string;
  name: string;
  surname: string;
  badgeNumber: string;
  idNumber: string;
  employmentStatus: string;
  province: string;
  region: string;
  officerTypeId: number;
  roleId: number;
  createdAt: string;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

/** Optional evidence payload from mobile (may also be embedded in `location` JSON). */
export interface TestEvidenceFields {
  roadblockId?: string;
  roadblock?: string;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  locationBounds?: {
    centerLat: number;
    centerLng: number;
    radiusMeters: number;
  };
  supervisorEmail?: string;
  supervisorName?: string;
  shiftStartsAt?: string;
  shiftEndsAt?: string;
  officerRank?: string;
  serviceNumber?: string;
  station?: string;
  driverCategory?: string;
  driverCategoryKey?: string;
  bacLimitG100ml?: number;
  bacLimitMg1000ml?: number;
  settingsRevision?: number;
  officerNotes?: string;
  photoUrls?: string[];
}

export interface TestRecord {
  id: string;
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob?: string;
  bacReading: number;
  result: 'pass' | 'fail';
  createdAt: string;
  location?: string | Record<string, unknown>;
  hash?: string;
  hashValid?: boolean | null;
  evidence?: TestEvidenceFields;
}

export interface FieldOfficer {
  officerId: number;
  userId: string;
  name: string;
  firstName: string;
  surname: string;
  email: string;
  serviceNumber: string;
  rank: string;
  station: string;
  status: string;
  dutyStatus?: string;
  createdAt: string;
  invitationExpiresAt?: string;
  inviteEmailSent?: boolean;
  inviteLink?: string;
  emailWarning?: string;
}

export type RoadblockShiftStatus = 'scheduled' | 'active' | 'closed' | 'cancelled';

export interface RoadblockShift {
  id: string;
  roadblockName: string;
  station: string;
  supervisorEmail: string;
  supervisorName: string | null;
  startsAt: string;
  endsAt: string;
  status: RoadblockShiftStatus;
  centerLat: number | null;
  centerLng: number | null;
  radiusMeters: number | null;
  notes: string | null;
  assignedOfficerIds: number[];
  assignmentStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoadblockShiftPayload {
  roadblockName: string;
  station: string;
  startsAt: string;
  endsAt: string;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusMeters?: number | null;
  notes?: string | null;
  assignedOfficerIds: number[];
}

/** Live duty/employment badge shown on the Officers roster. */
export type OfficerDutyStatus =
  | 'Invited'
  | 'On Patrol'
  | 'On Duty'
  | 'On Break'
  | 'Off Duty'
  | 'Inactive';

/** @deprecated Prefer OfficerDutyStatus */
export type OfficerShiftStatus = OfficerDutyStatus;

export interface TestEvidence {
  referenceId: string;
  driverName: string;
  driverId: string;
  driverCategory: string;
  reading: string;
  officer: string;
  serviceNumber: string;
  rank: string;
  station: string;
  timestamp: string;
  roadblockId: string;
  roadblock: string;
  locationLabel: string;
  gps: string;
  supervisor: string;
  shiftWindow: string;
  bounds: string;
  officerNotes: string;
  photoUrls: string[];
}

export type CaseStatus = 'new' | 'under_review' | 'verified' | 'referred' | 'invalidated' | 'closed';

export const EVIDENCE_CATEGORY_LABELS: Record<string, string> = {
  licence_front: 'Licence Front',
  breathalyser_screen: 'Breathalyser Screen',
  vehicle: 'Vehicle',
  scene_note: 'Officer Scene Note',
  signature_witness: 'Signature / Witness'
};

export function evidenceCategoryLabel(category: unknown): string {
  return typeof category === 'string' && EVIDENCE_CATEGORY_LABELS[category]
    ? EVIDENCE_CATEGORY_LABELS[category]
    : 'General';
}

/** Test with its current lifecycle case state (from GET /api/supervisor/cases). */
export interface CaseRecord {
  id: string;
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: 'pass' | 'fail';
  location: string;
  createdAt: string;
  caseStatus: CaseStatus;
  supervisorEmail: string | null;
  lastComment: string | null;
  caseUpdatedAt: string | null;
}

export type VerificationHashStatus = 'verified' | 'tampered' | 'unavailable';

/** One opaque court verification token, issued per PDF export. */
export interface VerificationTokenRecord {
  testId: string;
  token: string;
  referenceId: string;
  hash: string;
  hashStatus: VerificationHashStatus;
  timestamp: string;
  officerBadge: string;
  issuedAt: string;
}

/** Strict allowlist returned by the anonymous public verification endpoint. */
export interface PublicVerification {
  referenceId: string;
  hashStatus: VerificationHashStatus;
  timestamp: string;
  issuedAt: string;
  officerBadge: string;
  driver: {
    name: string;
    id: string;
  };
}
