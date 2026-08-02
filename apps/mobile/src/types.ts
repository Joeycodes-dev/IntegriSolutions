export type UserRole = 'officer' | 'supervisor';

export type BacCategoryKey = 'general' | 'professional';

export interface BacLimitSetting {
  key: BacCategoryKey;
  label: string;
  limitG100ml: number;
  limitMg1000ml: number;
}

/** Role-safe runtime settings fetched from GET /api/config/runtime. */
export interface RuntimeConfig {
  auth: { sessionTimeoutMinutes: number };
  export: {
    pdfWatermarkEnabled: boolean;
    pdfWatermarkText: string;
    pdfAccess: 'admin_only' | 'admin_supervisor' | 'disabled';
  };
  alerts: {
    integrityFlagCount: number;
    failureRateChangePoints: number;
    roadblockMinimumTests: number;
    avgFailingBacMultiple: number;
  };
  bacLimits: BacLimitSetting[];
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
