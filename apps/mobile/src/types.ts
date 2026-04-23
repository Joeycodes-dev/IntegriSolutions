export type UserRole = 'officer' | 'supervisor';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  badgeNumber: string;
  role: UserRole;
  createdAt: string;
}

export interface DriverLicenseData {
  name: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
}
