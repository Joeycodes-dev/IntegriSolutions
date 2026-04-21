export type UserRole = 'officer' | 'supervisor';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  badgeNumber: string;
  role: UserRole;
  createdAt: string;
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline';

export interface TestRecord {
  id: string;
  createdAt: string;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  bacReading: number;
  result: 'pass' | 'fail';
  status?: string;
}
