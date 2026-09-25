import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const DRAFT_DIRECTORY = 'active-test-drafts';

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function draftDirectory(draftId: string): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Durable app storage is unavailable on this device.');
  return `${root}${DRAFT_DIRECTORY}/${safeSegment(draftId)}/`;
}

function extensionFor(sourceUri: string, mimeType?: string | null): string {
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  if (mime.includes('webp')) return 'webp';
  const match = sourceUri.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  const extension = match?.[1]?.toLowerCase();
  return extension && /^(jpe?g|png|heic|heif|webp)$/.test(extension)
    ? extension
    : 'jpg';
}

export async function persistDraftAttachment(params: {
  draftId: string;
  attachmentId: string;
  sourceUri: string;
  mimeType?: string | null;
}): Promise<string> {
  if (Platform.OS === 'web') return params.sourceUri;

  const directory = draftDirectory(params.draftId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = extensionFor(params.sourceUri, params.mimeType);
  const finalUri = `${directory}${safeSegment(params.attachmentId)}.${extension}`;
  const temporaryUri = `${finalUri}.part`;

  const existing = await FileSystem.getInfoAsync(finalUri);
  if (existing.exists && !existing.isDirectory && (existing.size ?? 0) > 0) {
    return finalUri;
  }
  if (existing.exists) {
    await FileSystem.deleteAsync(finalUri, { idempotent: true });
  }

  try {
    await FileSystem.copyAsync({ from: params.sourceUri, to: temporaryUri });
    const copied = await FileSystem.getInfoAsync(temporaryUri);
    if (!copied.exists || copied.isDirectory || copied.size == null || copied.size <= 0) {
      throw new Error('The captured image could not be verified in durable storage.');
    }
    await FileSystem.moveAsync({ from: temporaryUri, to: finalUri });
    return finalUri;
  } catch (error) {
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

export async function durableAttachmentExists(uri: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Browser picker results are not durable across a reload. Keep ordinary
    // data/HTTP URIs usable for web development, but require a recapture for
    // transient blob URLs.
    return !uri.startsWith('blob:');
  }
  // A native recovery payload must point into the app-private draft directory.
  // Cache/content URIs from ImagePicker are intentionally not accepted.
  if (!uri.includes(`/${DRAFT_DIRECTORY}/`)) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory && (info.size ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function deleteDraftAttachmentFiles(draftId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await FileSystem.deleteAsync(draftDirectory(draftId), { idempotent: true });
  } catch {
    // Orphan cleanup is best-effort and must never discard the visible draft.
  }
}

export async function deleteDurableAttachmentFile(uri: string): Promise<void> {
  if (Platform.OS === 'web' || !uri.includes(`/${DRAFT_DIRECTORY}/`)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // The database status is already committed; retry cleanup on a later sweep.
  }
}
