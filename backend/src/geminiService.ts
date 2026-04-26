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

function detectMimeType(base64Image: string): string {
  const header = base64Image.substring(0, 20);
  if (header.startsWith('/9j/')) return 'image/jpeg';
  if (header.startsWith('iVBOR')) return 'image/png';
  if (header.startsWith('R0lGOD')) return 'image/gif';
  if (header.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function validateApiKey(): void {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
}

export async function scanDriverLicense(base64Image: string): Promise<DriverLicenseData> {
  validateApiKey();

  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const mimeType = detectMimeType(base64Image);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        parts: [
          {
            text: `Extract the following from this South African driver's license image and return as JSON:
- name: Driver's full name (first names)
- surname: Driver's surname
- initials: Driver's initials
- idNumber: 13-digit South African ID number
- licenseNumber: Driver's license number
- dob: Date of birth (YYYY-MM-DD format)
- expiryDate: License expiry date (YYYY-MM-DD format)
- licenseCodes: License codes (e.g., A, B, C, etc.)`
          },
          { inlineData: { mimeType, data: base64Image } }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          surname: { type: Type.STRING },
          initials: { type: Type.STRING },
          idNumber: { type: Type.STRING },
          licenseNumber: { type: Type.STRING },
          dob: { type: Type.STRING },
          expiryDate: { type: Type.STRING },
          licenseCodes: { type: Type.STRING }
        },
        required: ['name', 'surname', 'idNumber', 'licenseNumber', 'dob', 'expiryDate']
      }
    }
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Empty response from Gemini API');
  }

  try {
    const data = JSON.parse(responseText) as DriverLicenseData;
    return data;
  } catch (error) {
    throw new Error(`Failed to parse Gemini response: ${error instanceof Error ? error.message : String(error)}`);
  }
}
