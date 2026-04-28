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

export async function scanDriverLicense(_base64Image: string): Promise<DriverLicenseData> {
  throw new Error('Web OCR scanning is disabled. Use the mobile app to scan driver licenses.');
}
