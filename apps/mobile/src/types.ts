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
    engine?: 'google-vision' | 'tesseract';
    overallConfidence: number;
    fieldConfidence: Record<string, number>;
    passes: Array<{ name: string; confidence: number; preview: string }>;
    usedPaidFallback: boolean;
    fallbackReason: string | null;
  };
}
