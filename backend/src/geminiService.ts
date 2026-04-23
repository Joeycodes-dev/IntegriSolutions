export interface DriverLicenseData {
  name: string;
  licenseNumber: string;
  dob: string;
  expiryDate: string;
}

export async function scanDriverLicense(base64Image: string): Promise<DriverLicenseData> {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          { text: "Extract the driver's full name, license number, date of birth, and expiry date from this South African driver's license image. Return as JSON." },
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          licenseNumber: { type: Type.STRING },
          dob: { type: Type.STRING },
          expiryDate: { type: Type.STRING }
        },
        required: ['name', 'licenseNumber', 'dob', 'expiryDate']
      }
    }
  });

  return JSON.parse(response.text || '{}') as DriverLicenseData;
}
