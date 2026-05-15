export type UserRole = 'officer' | 'supervisor';

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
}
