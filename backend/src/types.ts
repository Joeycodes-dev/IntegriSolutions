export type UserRole = 'officer' | 'supervisor' | 'admin';

export interface UserProfile {
  uid: string;                    // Supabase Auth user ID
  officerId?: number;           // DB auto-generated officer_id
  email: string;
  name: string;
  surname: string;
  badgeNumber: string;
  idNumber: string;
  employmentStatus: string;
  dutyStatus: string;
  province: string;
  region: string;
  officerTypeId: number;
  roleId: number;
  createdAt: string;
}

export interface TestDeviceCustody {
  transport: string;
  serial: string | null;
  calibrationVersion: string;
  calibrationR0: number;
  sessionPeakRaw: number;
  avgRaw: number;
  raw: number;
  capturedAt: string;
}

export interface TestRecord {
  id?: string;
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: 'pass' | 'fail';
  hash?: string;
  hashValid?: boolean | null;
  createdAt: string;
  location?: string;
  originalTestId?: string | null;
  device?: TestDeviceCustody | null;
}
