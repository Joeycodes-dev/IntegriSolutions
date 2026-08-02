import { useAuth } from './AuthContext';
import { isAdmin } from './roles';
import { useRuntimeConfig } from './runtimeConfig';
import type { PdfAccessPolicy, UserProfile } from '../types';

export interface PdfAccess {
  loading: boolean;
  allowed: boolean;
  policy: PdfAccessPolicy;
}

/** Resolves whether the signed-in user may generate court PDFs per admin policy. */
export function usePdfAccess(): PdfAccess {
  let profile: UserProfile | null = null;
  try {
    profile = useAuth().profile;
  } catch {
    // No auth context (e.g. isolated component tests): default to supervisor policy.
    profile = null;
  }
  const config = useRuntimeConfig();
  const policy = config?.export.pdfAccess ?? 'admin_supervisor';

  let allowed = true;
  if (policy === 'disabled') allowed = false;
  if (policy === 'admin_only' && !isAdmin(profile?.roleId ?? -1)) allowed = false;

  return { loading: config === null, allowed, policy };
}
