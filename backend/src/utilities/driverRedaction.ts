/**
 * Deterministic display masking for the public court verification page.
 * Raw driver PII must never leave the backend through the public DTO.
 */

export function redactDriverName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .map((part) => {
      const first = part.charAt(0).toUpperCase();
      const maskLength = Math.max(part.length - 1, 1);
      return `${first}${'*'.repeat(maskLength)}`;
    })
    .join(' ');
}

export function redactDriverId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return '';
  const visible = trimmed.slice(-4);
  return `${'*'.repeat(Math.max(trimmed.length - visible.length, 0))}${visible}`;
}
