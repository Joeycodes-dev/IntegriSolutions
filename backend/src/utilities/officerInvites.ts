import crypto from 'crypto';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 14;

export function generateOfficerInviteToken(): string {
  return crypto
    .randomBytes(INVITE_TOKEN_BYTES)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function hashOfficerInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function extractOfficerInviteToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    const queryToken = url.searchParams.get('token') ?? url.searchParams.get('invite');
    if (queryToken?.trim()) return queryToken.trim();

    const segments = url.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
  } catch {
    const queryMatch = trimmed.match(/[?&](?:token|invite)=([^&#]+)/i);
    if (queryMatch?.[1]) {
      return decodeURIComponent(queryMatch[1]).trim();
    }
    return trimmed;
  }
}

export function officerInviteExpiresAt(now = new Date()): string {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  return expiresAt.toISOString();
}

export function buildOfficerInviteLink(token: string): string {
  const baseUrl = process.env.OFFICER_INVITE_BASE_URL ?? 'integriscan://onboard';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}