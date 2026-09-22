import type { Context } from 'hono';

export async function readJson<T = Record<string, unknown>>(c: Context): Promise<T> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return {} as T;
  }

  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}
