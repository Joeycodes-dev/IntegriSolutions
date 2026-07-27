import { createClient } from '@supabase/supabase-js';

const serviceSupabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

export function formatAuditId(id: number): string {
  return `AUD-${String(id).padStart(4, '0')}`;
}

export function formatActor(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.toLowerCase();
}

export function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function writeAuditLog(
  actorEmail: string,
  action: string,
  target: string
): Promise<void> {
  const { error } = await serviceSupabase.from('audit_logs').insert([
    {
      actor_email: actorEmail,
      action,
      target
    }
  ]);

  if (error) {
    console.error('[audit] failed to write log:', error.message);
  }
}

export function toAuditEntry(row: Record<string, unknown>) {
  const id = Number(row.id);
  return {
    id,
    auditId: formatAuditId(id),
    actor: formatActor(String(row.actor_email)),
    action: String(row.action),
    target: String(row.target),
    timestamp: formatAuditTimestamp(String(row.created_at))
  };
}
