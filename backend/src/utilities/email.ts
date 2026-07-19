interface OfficerInviteEmailParams {
  to: string;
  officerName: string;
  inviteLink: string;
  expiresAt: string;
}

interface ResendErrorPayload {
  message?: string;
  name?: string;
  error?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

function requireEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Invite email service is not configured. Set RESEND_API_KEY on the backend.');
  }

  return {
    apiKey,
    from: process.env.RESEND_FROM_EMAIL ?? 'IntegriScan <onboarding@resend.dev>'
  };
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendOfficerInviteEmail(params: OfficerInviteEmailParams): Promise<void> {
  const { apiKey, from } = requireEmailConfig();
  const expiry = formatExpiry(params.expiresAt);
  const subject = 'Your IntegriScan officer invite';
  const officerName = escapeHtml(params.officerName);
  const inviteLink = escapeHtml(params.inviteLink);
  const expiryLabel = escapeHtml(expiry);

  const text = [
    `Hello ${params.officerName},`,
    '',
    'You have been invited to use the IntegriScan mobile app.',
    'Open the app, choose the invite setup option, paste this invite link, and create your password:',
    '',
    params.inviteLink,
    '',
    `This invite expires on ${expiry}.`,
    '',
    'If you were not expecting this invite, you can ignore this email.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px">Your IntegriScan officer invite</h2>
      <p>Hello ${officerName},</p>
      <p>You have been invited to use the IntegriScan mobile app.</p>
      <p>Open the app, choose the invite setup option, paste this invite link, and create your password:</p>
      <p><a href="${inviteLink}" style="color:#4338ca;font-weight:700">${inviteLink}</a></p>
      <p style="font-size:13px;color:#475569">This invite expires on ${expiryLabel}.</p>
      <p style="font-size:13px;color:#475569">If you were not expecting this invite, you can ignore this email.</p>
    </div>
  `;

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject,
      text,
      html
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({} as ResendErrorPayload));
    const message = payload.message ?? payload.error ?? response.statusText;
    throw new Error(`Failed to send officer invite email: ${message}`);
  }
}