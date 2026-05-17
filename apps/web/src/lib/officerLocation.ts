export interface OfficerLocation {
  address: string;
  phone?: string;
  shift?: string;
}

/** Parses station/region field (plain text, legacy "addr · shift", or JSON). */
export function parseOfficerLocation(station: string): OfficerLocation {
  const trimmed = station?.trim() ?? '';
  if (!trimmed) return { address: '—' };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && typeof parsed.address === 'string') {
      return {
        address: parsed.address,
        phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
        shift: typeof parsed.shift === 'string' ? parsed.shift : undefined
      };
    }
  } catch {
    // not JSON
  }

  const [address, shift] = trimmed.split('·').map((s) => s.trim());
  return {
    address: address || trimmed,
    shift: shift || undefined
  };
}

export function serializeOfficerLocation(location: OfficerLocation): string {
  if (location.phone || location.shift) {
    return JSON.stringify({
      address: location.address,
      ...(location.phone ? { phone: location.phone } : {}),
      ...(location.shift ? { shift: location.shift } : {})
    });
  }
  return location.address;
}

export function formatSouthAfricanPhone(phone?: string): string {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.length < 9) return '—';

  let local = digits;
  if (local.startsWith('27')) local = local.slice(2);
  if (local.startsWith('0')) local = local.slice(1);

  if (local.length === 9) {
    return `(+27) ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }

  return phone?.trim() || '—';
}
