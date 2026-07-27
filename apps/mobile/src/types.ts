export type UserRole = 'officer' | 'supervisor';

export type DutyStatus = 'On Patrol' | 'Checkpoint' | 'Break' | 'Off Duty';

export const DUTY_STATUSES: DutyStatus[] = ['On Patrol', 'Checkpoint', 'Break', 'Off Duty'];

export interface UserProfile {
  uid: string;
  officerId?: number;
  email: string;
  name: string;
  surname: string;
  badgeNumber: string;
  idNumber: string;
  employmentStatus: string;
  dutyStatus?: DutyStatus;
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
}
