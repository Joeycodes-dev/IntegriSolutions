export type UserRole = 'officer' | 'supervisor' | 'admin';

export type AdminNavItem = 'users' | 'audit' | 'config';

export type SupervisorNavItem = 'dashboard' | 'logs' | 'officers' | 'reports';

export interface SystemConfigCard {
  id: string;
  title: string;
  lines: string[];
}

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
  roadblock?: string;
  locationLabel?: string;
  lat?: number;
  lng?: number;
  officerRank?: string;
  serviceNumber?: string;
  station?: string;
  driverCategory?: string;
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
  location?: string;
  hash?: string;
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
  createdAt: string;
}

export type OfficerShiftStatus = 'On Patrol' | 'Checkpoint' | 'Break';

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
  roadblock: string;
  locationLabel: string;
  gps: string;
  officerNotes: string;
  photoUrls: string[];
}
