import type { DriverLicenseData } from '../types';

export type { DriverLicenseData } from '../types';

export async function scanDriverLicense(_imageUri: string, _options?: { retry?: boolean }): Promise<DriverLicenseData> {
  throw new Error('Front-of-licence photo scanning is not available on the web. Use the PDF417 barcode scanner instead.');
}
