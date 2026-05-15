export type UserRole = 'officer' | 'supervisor';

export interface UserProfile {
  uid: string;                    // Supabase Auth user ID
  officerId?: number;           // DB auto-generated officer_id
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
  createdAt: string;
  location?: string;
}
