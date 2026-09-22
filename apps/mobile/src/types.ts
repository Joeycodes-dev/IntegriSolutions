export type UserRole = 'officer' | 'supervisor';

export type BacCategoryKey = 'general' | 'professional';

export interface BacLimitSetting {
  key: BacCategoryKey;
  label: string;
  limitG100ml: number;
  limitMg1000ml: number;
}

/** Role-safe runtime settings fetched from GET /api/config/runtime. */
export interface RuntimeConfig {
  auth: { sessionTimeoutMinutes: number };
  export: {
    pdfWatermarkEnabled: boolean;
    pdfWatermarkText: string;
    pdfAccess: 'admin_only' | 'admin_supervisor' | 'disabled';
  };
  alerts: {
    integrityFlagCount: number;
    failureRateChangePoints: number;
    roadblockMinimumTests: number;
    avgFailingBacMultiple: number;
  };
  bacLimits: BacLimitSetting[];
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
  dutyStatus?: string;
  province: string;
  region: string;
  officerTypeId: number;
  roleId: number;
  createdAt: string;
}

export interface DriverLicenseData {
  name: string;
  surname: string;
  initials: string;
  idNumber: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
  licenseCodes: string;
  _ocr?: {
    engine?: 'google-vision' | 'tesseract' | 'ml-kit';
    overallConfidence: number;
    fieldConfidence: Record<string, number>;
    passes: Array<{ name: string; confidence: number; preview: string }>;
    usedPaidFallback: boolean;
    fallbackReason: string | null;
  };
}

export type OperationalAlertType = 'bolo_person' | 'bolo_vehicle' | 'hazard' | 'general';
/** critical = immediate emergency / officer-safety / life-safety event.
 * high remains an urgent-but-non-emergency operational priority — it is
 * not renamed or repurposed. Order: critical > high > medium > low. */
export type OperationalAlertPriority = 'critical' | 'high' | 'medium' | 'low';
export type OperationalAlertSourceType = 'internal' | 'external';
export type OperationalAlertStatus = 'active' | 'expired' | 'cancelled' | 'resolved';
export type OperationalAlertTargetScope = 'all_officers' | 'shift' | 'officers';

/** BOLO / hazard / general operational bulletins — see GET /api/alerts/active. */
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
  issuedByName: string;
  targetScope: OperationalAlertTargetScope;
  sourceType: OperationalAlertSourceType;
  sourceAuthority: string | null;
  sourceReference: string | null;
  status: OperationalAlertStatus;
  expiresAt: string | null;
  createdAt: string;
  /** Non-null once the signed-in officer has acknowledged this alert. */
  acknowledgedAt: string | null;
  /** Bumped by the backend on a material edit — acknowledgedAt above is
   * already scoped to this version, so no client-side version handling is
   * needed for badge/Home unacknowledged-again behavior. */
  version: number;
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
