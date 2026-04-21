export type UserRole = 'officer' | 'supervisor';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  badgeNumber: string;
  role: UserRole;
  createdAt: string;
}

export interface TestRecord {
  id: string;
  officerId: string;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: 'pass' | 'fail';
  status: string;
  createdAt: string;
  location: { lat: number; lng: number };
}
