export interface DriverLicenseData {
  name: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
}

export async function scanDriverLicense(_base64Image: string): Promise<DriverLicenseData> {
  throw new Error('Web OCR scanning is disabled. Use the mobile app to scan driver licenses.');
}
