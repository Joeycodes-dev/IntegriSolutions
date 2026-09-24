export type UserRole = 'officer' | 'supervisor' | 'admin';

export type AdminNavItem = 'users' | 'audit' | 'config' | 'roadOffences' | 'chat';

export type SupervisorNavItem = 'dashboard' | 'logs' | 'cases' | 'officers' | 'shifts' | 'alerts' | 'reports' | 'roadOffences' | 'chat';

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

export type OperationalAlertType = 'bolo_person' | 'bolo_vehicle' | 'hazard' | 'general';
/** critical = immediate emergency / officer-safety / life-safety event.
 * high remains an urgent-but-non-emergency operational priority — it is
 * not renamed or repurposed. Order: critical > high > medium > low. */
export type OperationalAlertPriority = 'critical' | 'high' | 'medium' | 'low';
export type OperationalAlertSourceType = 'internal' | 'external';
export type OperationalAlertStatus = 'active' | 'expired' | 'cancelled' | 'resolved';
export type OperationalAlertTargetScope = 'all_officers' | 'shift' | 'officers';

/** BOLO / hazard / general operational bulletins — see /api/supervisor/alerts. */
export interface OperationalAlert {
  id: string;
  alertType: OperationalAlertType;
  priority: OperationalAlertPriority;
  description: string;
  vehicleRegistration: string | null;
  vehicleDescription: string | null;
  personName: string | null;
  personDescription: string | null;
  personReference: string | null;
  photoUrl: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string | null;
  /** Optional geofence trigger radius in metres, paired with locationLat/Lng. */
  locationRadiusMeters: number | null;
  issuedBySource: 'supervisor_users';
  issuedById: number;
  issuedByName: string;
  targetScope: OperationalAlertTargetScope;
  targetShiftId: string | null;
  sourceType: OperationalAlertSourceType;
  sourceAuthority: string | null;
  sourceReference: string | null;
  status: OperationalAlertStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedOfficerIds: number[];
  acknowledgementCount: number;
  matchCount: number;
  /** Bumped by the backend on a material edit (see computeMaterialChange in
   * routes/supervisor/alerts.ts) — an acknowledgement recorded against an
   * earlier version does not count toward this one. */
  version: number;
  /** Set only when status is 'resolved' or 'cancelled' — required by the
   * backend for both transitions. Resolved = the operational condition
   * ended/completed; cancelled = the alert was withdrawn, issued in error,
   * or is no longer applicable. Neither implies a legal determination. */
  statusReason: string | null;
  statusReasonBy: string | null;
  statusReasonAt: string | null;
}

export interface CreateOperationalAlertPayload {
  alertType: OperationalAlertType;
  priority: OperationalAlertPriority;
  description: string;
  vehicleRegistration?: string;
  vehicleDescription?: string;
  personName?: string;
  personDescription?: string;
  personReference?: string;
  location?: { lat?: number; lng?: number; label?: string; radiusMeters?: number };
  targetScope: OperationalAlertTargetScope;
  targetShiftId?: string | null;
  officerIds?: number[];
  sourceType: OperationalAlertSourceType;
  sourceAuthority?: string;
  sourceReference?: string;
  expiresAt?: string | null;
}

export interface UpdateOperationalAlertLocationPayload {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
  radiusMeters?: number | null;
}

/**
 * PATCH /api/supervisor/alerts/:id. Fields beyond status/expiresAt/location
 * are optional edits — priority, target scope/officers, and source fields
 * always trigger re-acknowledgement when materially changed; a description
 * edit only does when materialChangeOverride is explicitly set (the "This
 * changes operational meaning — require re-acknowledgement" checkbox,
 * default OFF).
 */
export interface UpdateOperationalAlertPayload {
  status?: OperationalAlertStatus;
  expiresAt?: string | null;
  location?: UpdateOperationalAlertLocationPayload;
  priority?: OperationalAlertPriority;
  description?: string;
  targetScope?: OperationalAlertTargetScope;
  targetShiftId?: string | null;
  officerIds?: number[];
  sourceType?: OperationalAlertSourceType;
  sourceAuthority?: string;
  sourceReference?: string;
  materialChangeOverride?: boolean;
  /** Required by the backend when status is 'resolved' or 'cancelled'. */
  reason?: string;
}

/**
 * GET /api/supervisor/alerts/:id/coverage — acknowledgement coverage for the
 * alert's *current* version, resolved against the actual eligible roster for
 * its target scope. criticalNonAckWarning is informational only: it never
 * implies automatic dispatch, punishment, or escalation.
 */
export interface OperationalAlertCoverage {
  alertId: string;
  version: number;
  priority: OperationalAlertPriority;
  status: OperationalAlertStatus;
  targetScope: OperationalAlertTargetScope;
  totalTargeted: number;
  acknowledgedCount: number;
  outstandingCount: number;
  percentage: number;
  acknowledgedOfficers: Array<{ officerId: number; officerName: string; badgeNumber: string; acknowledgedAt: string }>;
  outstandingOfficers: Array<{ officerId: number; officerName: string; badgeNumber: string }>;
  criticalNonAckWarning: boolean;
  criticalNonAckThresholdMinutes: number;
}

export interface OperationalAlertAcknowledgement {
  officerId: number;
  officerName: string;
  badgeNumber: string;
  acknowledgedAt: string;
}

export interface OperationalAlertMatch {
  id: number;
  officerId: number;
  officerName: string;
  badgeNumber: string;
  notes: string;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
}

/**
 * A "reported sighting" — an officer's possible-match report, for the
 * supervisor Map/Heatmap views. This is the exact same underlying record as
 * OperationalAlertMatch (operational_alert_matches), just always carrying
 * coordinates and flattened with its parent alert's display context. It is
 * NOT a confirmed location, wanted/stolen status, or identification — always
 * render/label it as a reported sighting or possible match, never as
 * "located"/"found"/"confirmed".
 */
export interface AlertSighting {
  id: number;
  alertId: string;
  notes: string;
  locationLat: number;
  locationLng: number;
  createdAt: string;
  officerId: number;
  officerName: string;
  badgeNumber: string;
  alertType: OperationalAlertType;
  alertDescription: string;
  priority: OperationalAlertPriority;
  alertStatus: OperationalAlertStatus;
  sourceType: OperationalAlertSourceType;
  sourceAuthority: string | null;
}

export interface AlertSightingFilters {
  alertType?: OperationalAlertType;
  priority?: OperationalAlertPriority;
  alertId?: string;
  from?: string;
  to?: string;
}

export interface ChatOfficerContact {
  officerId: number;
  name: string;
  badgeNumber: string;
  email: string;
}

export interface ChatParticipant {
  source: 'officer_users' | 'supervisor_users' | 'admin_users';
  participantId: number;
  roleId: number;
  name: string;
  badgeNumber: string | null;
}

export interface ChatThreadSummary {
  id: string;
  kind: 'emergency' | 'direct' | 'group';
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string | null;
  unreadCount: number;
  participants: ChatParticipant[];
  latestMessage: {
    id: number;
    body: string;
    senderName: string;
    createdAt: string;
    isEmergency: boolean;
    priority: 'high' | 'medium' | 'low';
  } | null;
}

export interface ChatAttachment {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageUrl: string;
  openedCount: number;
  openedBy: Array<{
    source: 'officer_users' | 'supervisor_users' | 'admin_users';
    participantId: number;
    roleId: number;
    name: string;
    badgeNumber: string | null;
    openedAt: string;
  }>;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  threadId: string;
  replyToMessageId: number | null;
  replyTo: {
    id: number;
    senderName: string;
    body: string;
  } | null;
  body: string;
  sender: {
    source: 'officer_users' | 'supervisor_users' | 'admin_users';
    participantId: number;
    roleId: number;
    name: string;
  };
  isEmergency: boolean;
  priority: 'high' | 'medium' | 'low';
  seenCount: number;
  officersSeenCount: number;
  superUsersSeenCount: number;
  seenBy: Array<{
    source: 'officer_users' | 'supervisor_users' | 'admin_users';
    participantId: number;
    roleId: number;
    name: string;
    badgeNumber: string | null;
    readAt: string;
  }>;
  attachments: ChatAttachment[];
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

/** Breathalyzer device metadata bound into the record's integrity hash. */
export interface TestDeviceCustody {
  transport: 'ble' | 'bluetooth_classic' | 'simulated' | string;
  serial: string | null;
  calibrationVersion: string;
  calibrationR0: number;
  sessionPeakRaw: number;
  avgRaw: number;
  raw: number;
  capturedAt: string;
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
  device?: TestDeviceCustody | null;
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
  hash?: string;
  hashValid?: boolean | null;
  device?: TestDeviceCustody | null;
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
