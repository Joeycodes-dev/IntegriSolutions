import type { Context } from 'hono';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Uint8Array;
  size: number;
}

export interface ParsedUpload {
  file: UploadedFile | null;
  fields: Record<string, string>;
}

export async function readUpload(c: Context, fieldName: string): Promise<ParsedUpload> {
  const formData = await c.req.formData();
  const fields: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (key !== fieldName && typeof value === 'string') {
      fields[key] = value;
    }
  }

  const entry = formData.get(fieldName);
  if (entry instanceof File) {
    const buffer = new Uint8Array(await entry.arrayBuffer());
    return {
      file: {
        fieldname: fieldName,
        originalname: entry.name,
        encoding: '7bit',
        mimetype: entry.type,
        buffer,
        size: buffer.byteLength
      },
      fields
    };
  }

  return { file: null, fields };
}
