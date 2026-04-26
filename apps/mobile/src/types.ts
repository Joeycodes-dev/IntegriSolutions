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
  surname: string;
  initials: string;
  idNumber: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
  licenseCodes: string;
}
