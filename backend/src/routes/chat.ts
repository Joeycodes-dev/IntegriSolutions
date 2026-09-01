import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { ROLE_ADMIN, ROLE_OFFICER, ROLE_SUPERVISOR } from '../constants/roles';
import { resolveProfileByEmail, type ProfileSource } from '../utilities/resolveProfile';

type ChatActorSource = 'officer_users' | 'supervisor_users' | 'admin_users';
type ChatPriority = 'high' | 'medium' | 'low';

interface ChatActor {
  source: ChatActorSource;
  dbId: number;
  roleId: number;
  name: string;
  badgeNumber: string;
}

interface ChatParticipantRow {
  thread_id: string;
  participant_source: ChatActorSource;
  participant_id: number;
  role_id: number;
  display_name: string;
  badge_number: string | null;
  joined_at: string;
  last_read_at: string | null;
}

interface ChatThreadRow {
  id: string;
  kind: 'emergency' | 'direct' | 'group';
  title: string | null;
  created_by_source: ChatActorSource;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessageRow {
  id: number;
  thread_id: string;
  reply_to_message_id: number | null;
  sender_source: ChatActorSource;
  sender_id: number;
  sender_role_id: number;
  sender_name: string;
  body: string;
  is_emergency: boolean;
  priority: ChatPriority;
  created_at: string;
}

interface ParticipantIdentity {
  source: ChatActorSource;
  id: number;
  roleId: number;
  name: string;
  badgeNumber: string | null;
}

interface SeenViewer {
  source: ChatActorSource;
  participantId: number;
  roleId: number;
  name: string;
  badgeNumber: string | null;
  readAt: string;
}

interface ChatMessageReadRow {
  thread_id: string;
  message_id: number;
  viewer_source: ChatActorSource;
  viewer_id: number;
  role_id: number;
  viewer_name: string;
  badge_number: string | null;
  read_at: string;
}

interface OfficerContactRow {
  officer_id: number;
  officer_name: string;
  officer_surname: string;
  badge_number: string;
  officer_email_address: string;
  officer_employment_status: string;
}

interface SupervisorContactRow {
  supervisor_id: number;
  supervisor_name: string;
  supervisor_surname: string;
  badge_number: string;
  role_id: number;
  employment_status: string;
}

interface AdminContactRow {
  admin_id: number;
  admin_name: string;
  admin_surname: string;
  badge_number: string;
  role_id: number;
  employment_status: string;
}

interface ChatAttachmentRow {
  id: number;
  message_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  storage_url: string;
  created_at: string;
}

interface ChatAttachmentReadRow {
  attachment_id: number;
  viewer_source: ChatActorSource;
  viewer_id: number;
  role_id: number;
  viewer_name: string;
  badge_number: string | null;
  opened_at: string;
}

const ALLOWED_FILE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_MESSAGE = 5;
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: MAX_FILE_SIZE }, fileFilter: (_req, file, cb) => {
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
} });

const router = Router();

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

function isAllowedSource(source: ProfileSource): source is ChatActorSource {
  return source === 'officer_users' || source === 'supervisor_users' || source === 'admin_users';
}

function normalizeIds(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(ids));
}

function actorName(name: string, surname?: string | null): string {
  return `${name} ${surname ?? ''}`.trim() || name;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function isActiveStatus(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'active';
}

function normalizePriority(value: unknown): ChatPriority {
  if (typeof value !== 'string') return 'medium';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return 'medium';
}

function participantKey(source: ChatActorSource, id: number): string {
  return `${source}:${id}`;
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isAtOrAfter(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftTimestamp = toTimestamp(left);
  const rightTimestamp = toTimestamp(right);
  if (leftTimestamp === null || rightTimestamp === null) {
    return false;
  }
  return leftTimestamp >= rightTimestamp;
}

function normalizeIdentityValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function personIdentityKey(
  name: string | null | undefined,
  badgeNumber: string | null | undefined,
  source: ChatActorSource,
  participantId: number
): string {
  const normalizedName = normalizeIdentityValue(name);
  const normalizedBadge = normalizeIdentityValue(badgeNumber);
  if (normalizedName || normalizedBadge) {
    return `${normalizedName}|${normalizedBadge}`;
  }
  return participantKey(source, participantId);
}

function seenViewerKey(viewer: SeenViewer): string {
  return personIdentityKey(viewer.name, viewer.badgeNumber, viewer.source, viewer.participantId);
}

async function markThreadAsRead(threadId: string, actor: ChatActor): Promise<void> {
  const { data, error } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .eq('thread_id', threadId);

  if (error) {
    throw new Error(error.message);
  }

  const participants = (data ?? []) as ChatParticipantRow[];
  const matchingParticipants = participants.filter((participant) => (
    participant.participant_source === actor.source
    && participant.participant_id === actor.dbId
  ));

  if (matchingParticipants.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const updates = await Promise.all(
    matchingParticipants.map((participant) => serviceSupabase
      .from('chat_participants')
      .update({ last_read_at: now })
      .eq('thread_id', threadId)
      .eq('participant_source', participant.participant_source)
      .eq('participant_id', participant.participant_id))
  );

  const failedUpdate = updates.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new Error(failedUpdate.error.message);
  }

  const { data: messagesData, error: messagesError } = await serviceSupabase
    .from('chat_messages')
    .select('id, sender_source, sender_id')
    .eq('thread_id', threadId);

  if (messagesError) {
    throw new Error(messagesError.message);
  }

  const messageRows = (messagesData ?? []) as Array<{
    id: number;
    sender_source: ChatActorSource;
    sender_id: number;
  }>;

  const receiptRows: Array<{
    thread_id: string;
    message_id: number;
    viewer_source: ChatActorSource;
    viewer_id: number;
    role_id: number;
    viewer_name: string;
    badge_number: string | null;
    read_at: string;
  }> = [];

  for (const participant of matchingParticipants) {
    for (const message of messageRows) {
      receiptRows.push({
        thread_id: threadId,
        message_id: message.id,
        viewer_source: participant.participant_source,
        viewer_id: participant.participant_id,
        role_id: participant.role_id,
        viewer_name: participant.display_name,
        badge_number: participant.badge_number,
        read_at: now
      });
    }
  }

  if (receiptRows.length > 0) {
    const { error: receiptError } = await serviceSupabase
      .from('chat_message_reads')
      .upsert(receiptRows, { onConflict: 'thread_id,message_id,viewer_source,viewer_id' });

    // Keep compatibility when migration is not yet applied.
    if (receiptError && receiptError.code !== '42P01') {
      throw new Error(receiptError.message);
    }
  }
}

function groupSeenByFromReadReceipts(
  readRows: ChatMessageReadRow[],
  message: ChatMessageRow
): SeenViewer[] {
  return readRows
    .filter((row) => Number(row.message_id) === Number(message.id))
    .filter((row) => !(row.viewer_source === message.sender_source && row.viewer_id === message.sender_id))
    .map((row) => ({
      source: row.viewer_source,
      participantId: row.viewer_id,
      roleId: row.role_id,
      name: row.viewer_name,
      badgeNumber: row.badge_number,
      readAt: row.read_at
    }));
}

function uniqueParticipantIdentities(input: ParticipantIdentity[]): ParticipantIdentity[] {
  const seen = new Set<string>();
  const result: ParticipantIdentity[] = [];
  for (const item of input) {
    const key = participantKey(item.source, item.id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildSeenByForMessage(
  message: ChatMessageRow,
  participants: ChatParticipantRow[],
  rows: ChatMessageRow[]
): SeenViewer[] {
  const laterMessageParticipants = new Set(
    rows
      .filter((row) => row.thread_id === message.thread_id && isAtOrAfter(row.created_at, message.created_at) && row.id !== message.id)
      .map((row) => participantKey(row.sender_source, row.sender_id))
  );

  return participants
    .filter((participant) => {
      if (
        participant.participant_source === message.sender_source
        && participant.participant_id === message.sender_id
      ) {
        return false;
      }

      const key = participantKey(participant.participant_source, participant.participant_id);
      const readAfterMessage = isAtOrAfter(participant.last_read_at, message.created_at);
      const repliedAfterMessage = laterMessageParticipants.has(key);
      return readAfterMessage || repliedAfterMessage;
    })
    .map((participant) => ({
      source: participant.participant_source,
      participantId: participant.participant_id,
      roleId: participant.role_id,
      name: participant.display_name,
      badgeNumber: participant.badge_number,
      readAt: participant.last_read_at ?? message.created_at
    }));
}

function formatAttachment(attachment: ChatAttachmentRow, reads: ChatAttachmentReadRow[]): object {
  const attachmentReads = reads.filter((r) => r.attachment_id === attachment.id);
  return {
    id: attachment.id,
    fileName: attachment.file_name,
    fileType: attachment.file_type,
    fileSize: attachment.file_size,
    storageUrl: attachment.storage_url,
    openedCount: attachmentReads.length,
    openedBy: attachmentReads.map((r) => ({
      source: r.viewer_source,
      participantId: r.viewer_id,
      roleId: r.role_id,
      name: r.viewer_name,
      badgeNumber: r.badge_number,
      openedAt: r.opened_at
    })),
    createdAt: attachment.created_at
  };
}

async function resolveActor(req: AuthRequest): Promise<ChatActor | null> {
  if (!req.userEmail) return null;
  const resolved = await resolveProfileByEmail(req.userEmail, req.userId, serviceSupabase, req.preferredRoleId);
  if (!resolved || !isAllowedSource(resolved.source)) return null;
  return {
    source: resolved.source,
    dbId: resolved.dbId,
    roleId: resolved.profile.roleId,
    name: actorName(resolved.profile.name, resolved.profile.surname),
    badgeNumber: resolved.profile.badgeNumber
  };
}

async function ensureParticipant(threadId: string, actor: ChatActor): Promise<boolean> {
  const { data, error } = await serviceSupabase
    .from('chat_participants')
    .select('thread_id')
    .eq('thread_id', threadId)
    .eq('participant_source', actor.source)
    .eq('participant_id', actor.dbId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return !!data;
}

router.use(requireAuth);

router.get('/contacts/officers', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  const { data, error } = await serviceSupabase
    .from('officer_users')
    .select('officer_id, officer_name, officer_surname, badge_number, officer_email_address, officer_employment_status')
    .order('officer_name', { ascending: true });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const rows = (data ?? []) as OfficerContactRow[];
  const contacts = rows
    .filter((row) => row.officer_employment_status.toLowerCase() === 'active')
    .map((row) => ({
      officerId: Number(row.officer_id),
      name: actorName(row.officer_name, row.officer_surname),
      badgeNumber: row.badge_number,
      email: row.officer_email_address
    }))
    .filter((row) => {
      if (!query) return true;
      const haystack = `${row.name} ${row.badgeNumber} ${row.email}`.toLowerCase();
      return haystack.includes(query);
    });

  return res.json(contacts);
});

router.post('/attachments/upload', upload.array('files', MAX_FILES_PER_MESSAGE), async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const uploadedFiles = [];
  try {
    for (const file of req.files as Express.Multer.File[]) {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const storagePath = `chat-attachments/${actor.source}/${actor.dbId}/${timestamp}-${randomStr}-${file.originalname}`;

      const { data: uploadData, error: uploadError } = await serviceSupabase.storage
        .from('chat-files')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        return res.status(500).json({ error: `Failed to upload ${file.originalname}: ${uploadError.message}` });
      }

      const { data: urlData } = serviceSupabase.storage
        .from('chat-files')
        .getPublicUrl(storagePath);

      uploadedFiles.push({
        fileName: file.originalname,
        fileType: file.mimetype,
        fileSize: file.size,
        storagePath,
        storageUrl: urlData.publicUrl
      });
    }

    return res.status(201).json({ files: uploadedFiles });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'File upload failed' });
  }
});

router.post('/threads/emergency', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const officerIds = normalizeIds(body.officerIds);
  const title = typeof body.title === 'string' ? body.title.trim() : '';

  const sendToAllOfficers = normalizeBoolean(body.sendToAllOfficers, false);
  const sendToEveryone = normalizeBoolean(body.sendToEveryone, false);
  const includeSuperUsers = normalizeBoolean(body.includeSuperUsers, actor.roleId === ROLE_OFFICER);

  if (actor.roleId === ROLE_OFFICER && officerIds.some((id) => id === actor.dbId)) {
    return res.status(400).json({ error: 'Do not include your own officer id in recipients' });
  }

  if (actor.roleId !== ROLE_OFFICER && actor.roleId !== ROLE_SUPERVISOR && actor.roleId !== ROLE_ADMIN) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  if (!sendToAllOfficers && !sendToEveryone && officerIds.length === 0 && !includeSuperUsers) {
    return res.status(400).json({ error: 'Provide recipients: officerIds, includeSuperUsers, sendToAllOfficers, or sendToEveryone' });
  }

  let officerQuery = serviceSupabase
    .from('officer_users')
    .select('officer_id, officer_name, officer_surname, badge_number, role_id, officer_employment_status');

  if (sendToAllOfficers || sendToEveryone) {
    officerQuery = officerQuery.eq('officer_employment_status', 'Active');
  } else {
    officerQuery = officerQuery.in('officer_id', officerIds);
  }

  const { data: officers, error: officerError } = await officerQuery;

  if (officerError) {
    return res.status(500).json({ error: officerError.message });
  }

  const officerRows = (officers ?? []) as Array<{
    officer_id: number;
    officer_name: string;
    officer_surname: string;
    badge_number: string;
    role_id: number;
    officer_employment_status: string;
  }>;

  const activeOfficerRows = officerRows.filter((row) => isActiveStatus(row.officer_employment_status));

  if (!sendToAllOfficers && officerIds.length > 0 && activeOfficerRows.length !== officerIds.length) {
    return res.status(404).json({ error: 'One or more officer recipients were not found or are inactive' });
  }

  if ((sendToAllOfficers || sendToEveryone) && activeOfficerRows.length === 0) {
    return res.status(404).json({ error: 'No active officers found for broadcast' });
  }

  if (!sendToAllOfficers && activeOfficerRows.length === 0 && !includeSuperUsers) {
    return res.status(400).json({ error: 'At least one active recipient is required' });
  }

  const participantIdentities: ParticipantIdentity[] = [
    {
      source: actor.source,
      id: actor.dbId,
      roleId: actor.roleId,
      name: actor.name,
      badgeNumber: actor.badgeNumber
    },
    ...activeOfficerRows.map((row) => ({
      source: 'officer_users' as const,
      id: Number(row.officer_id),
      roleId: Number(row.role_id || ROLE_OFFICER),
      name: actorName(row.officer_name, row.officer_surname),
      badgeNumber: row.badge_number
    }))
  ];

  if (includeSuperUsers || sendToEveryone) {
    const [supervisorResult, adminResult] = await Promise.all([
      serviceSupabase
        .from('supervisor_users')
        .select('supervisor_id, supervisor_name, supervisor_surname, badge_number, role_id, employment_status')
        .eq('employment_status', 'Active'),
      serviceSupabase
        .from('admin_users')
        .select('admin_id, admin_name, admin_surname, badge_number, role_id, employment_status')
        .eq('employment_status', 'Active')
    ]);

    if (supervisorResult.error) {
      return res.status(500).json({ error: supervisorResult.error.message });
    }

    if (adminResult.error) {
      return res.status(500).json({ error: adminResult.error.message });
    }

    const supervisorRows = (supervisorResult.data ?? []) as SupervisorContactRow[];
    const adminRows = (adminResult.data ?? []) as AdminContactRow[];

    participantIdentities.push(
      ...supervisorRows
        .filter((row) => isActiveStatus(row.employment_status))
        .map((row) => ({
          source: 'supervisor_users' as const,
          id: Number(row.supervisor_id),
          roleId: Number(row.role_id || ROLE_SUPERVISOR),
          name: actorName(row.supervisor_name, row.supervisor_surname),
          badgeNumber: row.badge_number
        })),
      ...adminRows
        .filter((row) => isActiveStatus(row.employment_status))
        .map((row) => ({
          source: 'admin_users' as const,
          id: Number(row.admin_id),
          roleId: Number(row.role_id || ROLE_ADMIN),
          name: actorName(row.admin_name, row.admin_surname),
          badgeNumber: row.badge_number
        }))
    );
  }

  const uniqueIdentities = uniqueParticipantIdentities(participantIdentities);
  const desiredKeys = uniqueIdentities
    .map((item) => participantKey(item.source, item.id))
    .sort();

  const { data: actorThreadRows, error: actorThreadError } = await serviceSupabase
    .from('chat_participants')
    .select('thread_id')
    .eq('participant_source', actor.source)
    .eq('participant_id', actor.dbId);

  if (actorThreadError) {
    return res.status(500).json({ error: actorThreadError.message });
  }

  const candidateThreadIds = Array.from(new Set((actorThreadRows ?? []).map((row) => String((row as { thread_id: string }).thread_id))));
  if (candidateThreadIds.length > 0) {
    const { data: candidateThreadsData, error: candidateThreadsError } = await serviceSupabase
      .from('chat_threads')
      .select('id, updated_at, kind')
      .in('id', candidateThreadIds)
      .eq('kind', 'emergency');

    if (candidateThreadsError) {
      return res.status(500).json({ error: candidateThreadsError.message });
    }

    const emergencyThreadIds = (candidateThreadsData ?? []).map((thread) => String((thread as { id: string }).id));
    if (emergencyThreadIds.length > 0) {
      const { data: candidateParticipantsData, error: candidateParticipantsError } = await serviceSupabase
        .from('chat_participants')
        .select('thread_id, participant_source, participant_id')
        .in('thread_id', emergencyThreadIds);

      if (candidateParticipantsError) {
        return res.status(500).json({ error: candidateParticipantsError.message });
      }

      const keysByThread = new Map<string, string[]>();
      for (const row of candidateParticipantsData ?? []) {
        const participant = row as { thread_id: string; participant_source: ChatActorSource; participant_id: number };
        const list = keysByThread.get(participant.thread_id) ?? [];
        list.push(participantKey(participant.participant_source, Number(participant.participant_id)));
        keysByThread.set(participant.thread_id, list);
      }

      const orderedCandidates = ((candidateThreadsData ?? []) as Array<{ id: string; updated_at: string }>)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

      for (const thread of orderedCandidates) {
        const threadKeys = Array.from(new Set(keysByThread.get(thread.id) ?? [])).sort();
        if (threadKeys.length !== desiredKeys.length) continue;
        const isSameSet = threadKeys.every((value, idx) => value === desiredKeys[idx]);
        if (isSameSet) {
          return res.status(201).json({ id: thread.id });
        }
      }
    }
  }

  const { data: threadData, error: threadError } = await serviceSupabase
    .from('chat_threads')
    .insert({
      kind: 'emergency',
      title: title || null,
      created_by_source: actor.source,
      created_by_id: actor.dbId
    })
    .select('*')
    .single();

  if (threadError || !threadData) {
    return res.status(500).json({ error: threadError?.message ?? 'Failed to create chat thread' });
  }

  const dedupedParticipants = uniqueIdentities.map((item) => ({
    thread_id: threadData.id,
    participant_source: item.source,
    participant_id: item.id,
    role_id: item.roleId,
    display_name: item.name,
    badge_number: item.badgeNumber
  }));

  const { error: participantsError } = await serviceSupabase
    .from('chat_participants')
    .insert(dedupedParticipants);

  if (participantsError) {
    await serviceSupabase.from('chat_threads').delete().eq('id', threadData.id);
    return res.status(500).json({ error: participantsError.message });
  }

  return res.status(201).json({ id: threadData.id });
});

router.get('/threads', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const { data: ownParticipationRows, error: ownParticipationError } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .eq('participant_source', actor.source)
    .eq('participant_id', actor.dbId);

  if (ownParticipationError) {
    return res.status(500).json({ error: ownParticipationError.message });
  }

  const ownParticipations = (ownParticipationRows ?? []) as ChatParticipantRow[];
  const threadIds = ownParticipations.map((row) => row.thread_id);
  if (threadIds.length === 0) {
    return res.json([]);
  }

  const { data: threadsData, error: threadsError } = await serviceSupabase
    .from('chat_threads')
    .select('*')
    .in('id', threadIds)
    .order('updated_at', { ascending: false });

  if (threadsError) {
    return res.status(500).json({ error: threadsError.message });
  }

  const { data: participantsData, error: participantsError } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .in('thread_id', threadIds);

  if (participantsError) {
    return res.status(500).json({ error: participantsError.message });
  }

  const threads = (threadsData ?? []) as ChatThreadRow[];
  const participants = (participantsData ?? []) as ChatParticipantRow[];
  const participantsByThread = new Map<string, ChatParticipantRow[]>();

  for (const participant of participants) {
    const current = participantsByThread.get(participant.thread_id) ?? [];
    current.push(participant);
    participantsByThread.set(participant.thread_id, current);
  }

  const ownByThread = new Map<string, ChatParticipantRow>();
  for (const participation of ownParticipations) {
    ownByThread.set(participation.thread_id, participation);
  }

  const result = await Promise.all(threads.map(async (thread) => {
    const own = ownByThread.get(thread.id) ?? null;
    const { data: latestMessageData, error: latestError } = await serviceSupabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      throw new Error(latestError.message);
    }

    const unreadQuery = serviceSupabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', thread.id)
      // Count all messages except those sent by the current actor.
      .or(`sender_source.neq.${actor.source},sender_id.neq.${actor.dbId}`);

    if (own?.last_read_at) {
      unreadQuery.gt('created_at', own.last_read_at);
    }

    const { count, error: unreadError } = await unreadQuery;
    if (unreadError) {
      throw new Error(unreadError.message);
    }

    const threadParticipants = participantsByThread.get(thread.id) ?? [];

    return {
      id: thread.id,
      kind: thread.kind,
      title: thread.title,
      createdAt: thread.created_at,
      updatedAt: thread.updated_at,
      lastReadAt: own?.last_read_at ?? null,
      unreadCount: count ?? 0,
      participants: threadParticipants.map((participant) => ({
        source: participant.participant_source,
        participantId: participant.participant_id,
        roleId: participant.role_id,
        name: participant.display_name,
        badgeNumber: participant.badge_number
      })),
      latestMessage: latestMessageData
        ? {
          id: (latestMessageData as ChatMessageRow).id,
          body: (latestMessageData as ChatMessageRow).body,
          senderName: (latestMessageData as ChatMessageRow).sender_name,
          createdAt: (latestMessageData as ChatMessageRow).created_at,
          isEmergency: (latestMessageData as ChatMessageRow).is_emergency,
          priority: (latestMessageData as ChatMessageRow).priority ?? 'medium'
        }
        : null
    };
  }));

  const filtered = result.filter((thread) => thread.latestMessage !== null);

  return res.json(filtered);
});

router.get('/threads/:threadId/messages', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const threadId = String(req.params.threadId || '');
  if (!threadId) {
    return res.status(400).json({ error: 'Thread id is required' });
  }

  const canAccess = await ensureParticipant(threadId, actor);
  if (!canAccess) {
    return res.status(403).json({ error: 'Thread access denied' });
  }

  const markReadRaw = typeof req.query.markRead === 'string'
    ? req.query.markRead.trim().toLowerCase()
    : 'true';
  const shouldMarkRead = markReadRaw !== 'false';

  if (shouldMarkRead) {
    await markThreadAsRead(threadId, actor).catch(() => {
      // Best-effort read stamping; do not block message fetch.
    });
  }

  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 100;

  const { data, error } = await serviceSupabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: participantsData, error: participantsError } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .eq('thread_id', threadId);

  if (participantsError) {
    return res.status(500).json({ error: participantsError.message });
  }

  const participants = (participantsData ?? []) as ChatParticipantRow[];
  const rows = (data ?? []) as ChatMessageRow[];
  let readReceipts: ChatMessageReadRow[] = [];
  const { data: readRows, error: readRowsError } = await serviceSupabase
    .from('chat_message_reads')
    .select('*')
    .eq('thread_id', threadId);

  if (!readRowsError) {
    readReceipts = (readRows ?? []) as ChatMessageReadRow[];
  } else if (readRowsError.code !== '42P01') {
    return res.status(500).json({ error: readRowsError.message });
  }

  // Fetch attachments for all messages in this thread
  let allAttachments: ChatAttachmentRow[] = [];
  let allAttachmentReads: ChatAttachmentReadRow[] = [];
  
  if (rows.length > 0) {
    const messageIds = rows.map((r) => r.id);
    
    const { data: attachmentData, error: attachmentError } = await serviceSupabase
      .from('chat_attachments')
      .select('*')
      .in('message_id', messageIds);

    if (attachmentError && attachmentError.code !== '42P01') {
      return res.status(500).json({ error: attachmentError.message });
    }

    allAttachments = (attachmentData ?? []) as ChatAttachmentRow[];

    if (allAttachments.length > 0) {
      const attachmentIds = allAttachments.map((a) => a.id);
      const { data: readData, error: readError } = await serviceSupabase
        .from('chat_attachment_reads')
        .select('*')
        .in('attachment_id', attachmentIds);

      if (readError && readError.code !== '42P01') {
        return res.status(500).json({ error: readError.message });
      }

      allAttachmentReads = (readData ?? []) as ChatAttachmentReadRow[];
    }
  }

  const messageById = new Map<number, ChatMessageRow>();
  for (const row of rows) {
    messageById.set(row.id, row);
  }

  return res.json(rows.map((message) => {
    const receiptSeenBy = groupSeenByFromReadReceipts(readReceipts, message);
    const heuristicSeenBy = buildSeenByForMessage(message, participants, rows);
    const seenBy = Array.from(
      new Map([...receiptSeenBy, ...heuristicSeenBy].map((viewer) => [seenViewerKey(viewer), viewer])).values()
    );

    const officersSeenCount = seenBy.filter((viewer) => viewer.roleId === ROLE_OFFICER).length;
    const superUsersSeenCount = seenBy.filter((viewer) => viewer.roleId === ROLE_SUPERVISOR || viewer.roleId === ROLE_ADMIN).length;
    const replyTo = message.reply_to_message_id ? messageById.get(message.reply_to_message_id) ?? null : null;
    
    const messageAttachments = allAttachments.filter((a) => a.message_id === message.id);
    const attachments = messageAttachments.map((att) => formatAttachment(att, allAttachmentReads));

    return {
      id: message.id,
      threadId: message.thread_id,
      replyToMessageId: message.reply_to_message_id,
      replyTo: replyTo
        ? {
          id: replyTo.id,
          senderName: replyTo.sender_name,
          body: replyTo.body
        }
        : null,
      body: message.body,
      sender: {
        source: message.sender_source,
        participantId: message.sender_id,
        roleId: message.sender_role_id,
        name: message.sender_name
      },
      isEmergency: message.is_emergency,
      priority: message.priority ?? 'medium',
      seenCount: seenBy.length,
      officersSeenCount,
      superUsersSeenCount,
      seenBy,
      attachments,
      createdAt: message.created_at
    };
  }));
});

router.post('/threads/:threadId/messages', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const threadId = String(req.params.threadId || '');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const isEmergency = body.isEmergency !== false;
  const priority = normalizePriority(body.priority);
  const replyToMessageId = Number.isInteger(body.replyToMessageId)
    ? Number(body.replyToMessageId)
    : null;
  
  // Normalize attachments array
  const attachmentsInput = Array.isArray(body.attachments) ? body.attachments : [];
  const attachments = attachmentsInput.slice(0, MAX_FILES_PER_MESSAGE).map((att: unknown) => {
    const obj = att as Record<string, unknown>;
    const fileSize = Number.isInteger(obj.fileSize) ? (obj.fileSize as number) : 0;
    return {
      fileName: typeof obj.fileName === 'string' ? obj.fileName : '',
      fileType: typeof obj.fileType === 'string' ? obj.fileType : '',
      fileSize,
      storagePath: typeof obj.storagePath === 'string' ? obj.storagePath : '',
      storageUrl: typeof obj.storageUrl === 'string' ? obj.storageUrl : ''
    };
  }).filter((att) => att.fileName && att.storageUrl && att.fileSize > 0);

  if (!threadId) {
    return res.status(400).json({ error: 'Thread id is required' });
  }

  if (!text && attachments.length === 0) {
    return res.status(400).json({ error: 'Message body or attachments are required' });
  }

  if (text.length > 4000) {
    return res.status(400).json({ error: 'Message body exceeds 4000 characters' });
  }

  if (replyToMessageId !== null && replyToMessageId <= 0) {
    return res.status(400).json({ error: 'replyToMessageId must be a positive integer' });
  }

  const canAccess = await ensureParticipant(threadId, actor);
  if (!canAccess) {
    return res.status(403).json({ error: 'Thread access denied' });
  }

  let replyToMessage: ChatMessageRow | null = null;
  if (replyToMessageId !== null) {
    const { data: replyData, error: replyError } = await serviceSupabase
      .from('chat_messages')
      .select('*')
      .eq('id', replyToMessageId)
      .eq('thread_id', threadId)
      .maybeSingle();

    if (replyError) {
      return res.status(500).json({ error: replyError.message });
    }

    if (!replyData) {
      return res.status(400).json({ error: 'Reply target message was not found in this thread' });
    }

    replyToMessage = replyData as ChatMessageRow;
  }

  const { data, error } = await serviceSupabase
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      reply_to_message_id: replyToMessageId,
      sender_source: actor.source,
      sender_id: actor.dbId,
      sender_role_id: actor.roleId,
      sender_name: actor.name,
      body: text,
      is_emergency: isEmergency,
      priority
    })
    .select('*')
    .single();

  if (error || !data) {
    return res.status(500).json({ error: error?.message ?? 'Failed to send message' });
  }

  const insertedMessage = data as ChatMessageRow;
  
  // Insert attachments if provided
  let insertedAttachments: ChatAttachmentRow[] = [];
  if (attachments.length > 0) {
    const attachmentRows = attachments.map((att) => ({
      message_id: insertedMessage.id,
      file_name: att.fileName,
      file_type: att.fileType,
      file_size: att.fileSize,
      storage_path: att.storagePath,
      storage_url: att.storageUrl
    }));

    const { data: attachmentData, error: attachmentError } = await serviceSupabase
      .from('chat_attachments')
      .insert(attachmentRows)
      .select('*');

    if (attachmentError) {
      return res.status(500).json({ error: `Failed to save attachments: ${attachmentError.message}` });
    }

    insertedAttachments = (attachmentData ?? []) as ChatAttachmentRow[];
  }

  try {
    await markThreadAsRead(threadId, actor);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to mark thread as read' });
  }

  const { data: threadMessagesData, error: threadMessagesError } = await serviceSupabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (threadMessagesError) {
    return res.status(500).json({ error: threadMessagesError.message });
  }

  const { data: participantsData, error: participantsError } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .eq('thread_id', threadId);

  if (participantsError) {
    return res.status(500).json({ error: participantsError.message });
  }

  const { data: readRows, error: readRowsError } = await serviceSupabase
    .from('chat_message_reads')
    .select('*')
    .eq('thread_id', threadId)
    .eq('message_id', insertedMessage.id);

  if (readRowsError && readRowsError.code !== '42P01') {
    return res.status(500).json({ error: readRowsError.message });
  }

  const rows = (threadMessagesData ?? []) as ChatMessageRow[];
  const participants = (participantsData ?? []) as ChatParticipantRow[];
  const readReceipts = (readRows ?? []) as ChatMessageReadRow[];

  const receiptSeenBy = groupSeenByFromReadReceipts(readReceipts, insertedMessage);
  const heuristicSeenBy = buildSeenByForMessage(insertedMessage, participants, rows);
  const seenBy = Array.from(
    new Map([...receiptSeenBy, ...heuristicSeenBy].map((viewer) => [seenViewerKey(viewer), viewer])).values()
  );
  const officersSeenCount = seenBy.filter((viewer) => viewer.roleId === ROLE_OFFICER).length;
  const superUsersSeenCount = seenBy.filter((viewer) => viewer.roleId === ROLE_SUPERVISOR || viewer.roleId === ROLE_ADMIN).length;

  return res.status(201).json({
    id: insertedMessage.id,
    threadId,
    replyToMessageId: insertedMessage.reply_to_message_id,
    replyTo: replyToMessage
      ? {
        id: replyToMessage.id,
        senderName: replyToMessage.sender_name,
        body: replyToMessage.body
      }
      : null,
    body: insertedMessage.body,
    sender: {
      source: insertedMessage.sender_source,
      participantId: insertedMessage.sender_id,
      roleId: insertedMessage.sender_role_id,
      name: insertedMessage.sender_name
    },
    isEmergency: insertedMessage.is_emergency,
    priority: insertedMessage.priority ?? 'medium',
    seenCount: seenBy.length,
    officersSeenCount,
    superUsersSeenCount,
    seenBy,
    attachments: insertedAttachments.map((att) => ({
      id: att.id,
      fileName: att.file_name,
      fileType: att.file_type,
      fileSize: att.file_size,
      storageUrl: att.storage_url,
      openedCount: 0,
      openedBy: [],
      createdAt: att.created_at
    })),
    createdAt: insertedMessage.created_at
  });
});

router.post('/threads/:threadId/read', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const threadId = String(req.params.threadId || '');
  if (!threadId) {
    return res.status(400).json({ error: 'Thread id is required' });
  }

  const canAccess = await ensureParticipant(threadId, actor);
  if (!canAccess) {
    return res.status(403).json({ error: 'Thread access denied' });
  }

  await markThreadAsRead(threadId, actor).catch(() => {
    // Best-effort read stamping; do not block debug reads.
  });

  return res.json({ ok: true });
});

router.get('/threads/:threadId/messages/:messageId/seen-debug', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const threadId = String(req.params.threadId || '');
  const messageId = Number(req.params.messageId);

  if (!threadId || !Number.isInteger(messageId) || messageId <= 0) {
    return res.status(400).json({ error: 'Valid thread id and message id are required' });
  }

  const canAccess = await ensureParticipant(threadId, actor);
  if (!canAccess) {
    return res.status(403).json({ error: 'Thread access denied' });
  }

  try {
    await markThreadAsRead(threadId, actor);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to mark thread as read' });
  }

  const { data: messageData, error: messageError } = await serviceSupabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .eq('id', messageId)
    .maybeSingle();

  if (messageError) {
    return res.status(500).json({ error: messageError.message });
  }

  if (!messageData) {
    return res.status(404).json({ error: 'Message not found in thread' });
  }

  const message = messageData as ChatMessageRow;

  const { data: threadMessagesData, error: threadMessagesError } = await serviceSupabase
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (threadMessagesError) {
    return res.status(500).json({ error: threadMessagesError.message });
  }

  const { data: participantsData, error: participantsError } = await serviceSupabase
    .from('chat_participants')
    .select('*')
    .eq('thread_id', threadId);

  if (participantsError) {
    return res.status(500).json({ error: participantsError.message });
  }

  const participants = (participantsData ?? []) as ChatParticipantRow[];
  let readReceipts: ChatMessageReadRow[] = [];
  const { data: readRows, error: readRowsError } = await serviceSupabase
    .from('chat_message_reads')
    .select('*')
    .eq('thread_id', threadId)
    .eq('message_id', messageId);

  if (!readRowsError) {
    readReceipts = (readRows ?? []) as ChatMessageReadRow[];
  } else if (readRowsError.code !== '42P01') {
    return res.status(500).json({ error: readRowsError.message });
  }

  const readSeenBy = participants
    .filter((participant) => {
      if (
        participant.participant_source === message.sender_source
        && participant.participant_id === message.sender_id
      ) {
        return false;
      }
      return isAtOrAfter(participant.last_read_at, message.created_at);
    })
    .map((participant) => ({
      source: participant.participant_source,
      participantId: participant.participant_id,
      roleId: participant.role_id,
      name: participant.display_name,
      badgeNumber: participant.badge_number,
      lastReadAt: participant.last_read_at
    }));

  const repliedBy = buildSeenByForMessage(message, participants, (threadMessagesData ?? []) as ChatMessageRow[]).map((viewer) => ({
    source: viewer.source,
    participantId: viewer.participantId,
    roleId: viewer.roleId,
    name: viewer.name,
    badgeNumber: viewer.badgeNumber,
    lastReadAt: viewer.readAt
  }));

  const receiptSeenBy = readReceipts.map((row) => ({
    source: row.viewer_source,
    participantId: row.viewer_id,
    roleId: row.role_id,
    name: row.viewer_name,
    badgeNumber: row.badge_number,
    lastReadAt: row.read_at
  }));

  const seenBy = Array.from(new Map([
    ...readSeenBy,
    ...repliedBy,
    ...receiptSeenBy
  ].map((viewer) => [personIdentityKey(viewer.name, viewer.badgeNumber, viewer.source, viewer.participantId), viewer])).values());

  return res.json({
    threadId,
    message: {
      id: message.id,
      senderSource: message.sender_source,
      senderId: message.sender_id,
      createdAt: message.created_at,
      body: message.body
    },
    participants: participants.map((participant) => ({
      source: participant.participant_source,
      participantId: participant.participant_id,
      roleId: participant.role_id,
      name: participant.display_name,
      badgeNumber: participant.badge_number,
      lastReadAt: participant.last_read_at
    })),
    seenBy,
    seenCount: seenBy.length
  });
});

router.delete('/threads/empty', async (_req, res) => {
  const { data: emergencyThreads, error: emergencyThreadsError } = await serviceSupabase
    .from('chat_threads')
    .select('id')
    .eq('kind', 'emergency');

  if (emergencyThreadsError) {
    return res.status(500).json({ error: emergencyThreadsError.message });
  }

  const { data: messageThreadRows, error: messageThreadRowsError } = await serviceSupabase
    .from('chat_messages')
    .select('thread_id');

  if (messageThreadRowsError) {
    return res.status(500).json({ error: messageThreadRowsError.message });
  }

  const threadIdsWithMessages = new Set(
    (messageThreadRows ?? []).map((row) => String((row as { thread_id: string }).thread_id))
  );

  const ids = (emergencyThreads ?? [])
    .map((row) => String((row as { id: string }).id))
    .filter((id) => !threadIdsWithMessages.has(id));

  if (ids.length === 0) {
    return res.json({ deleted: 0 });
  }

  const { error: deleteError } = await serviceSupabase
    .from('chat_threads')
    .delete()
    .in('id', ids);

  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  return res.json({ deleted: ids.length });
});

router.post('/attachments/:attachmentId/opened', async (req, res) => {
  const authReq = req as unknown as AuthRequest;
  const actor = await resolveActor(authReq);
  if (!actor) {
    return res.status(403).json({ error: 'Chat access denied' });
  }

  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return res.status(400).json({ error: 'Invalid attachment id' });
  }

  // Verify the attachment exists and the user has access to the message
  const { data: attachmentData, error: attachmentError } = await serviceSupabase
    .from('chat_attachments')
    .select('id, message_id')
    .eq('id', attachmentId)
    .maybeSingle();

  if (attachmentError) {
    return res.status(500).json({ error: attachmentError.message });
  }

  if (!attachmentData) {
    return res.status(404).json({ error: 'Attachment not found' });
  }

  const messageId = (attachmentData as { id: number; message_id: number }).message_id;

  const { data: messageData, error: messageError } = await serviceSupabase
    .from('chat_messages')
    .select('thread_id')
    .eq('id', messageId)
    .maybeSingle();

  if (messageError) {
    return res.status(500).json({ error: messageError.message });
  }

  if (!messageData) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const threadId = (messageData as { thread_id: string }).thread_id;

  const canAccess = await ensureParticipant(threadId, actor);
  if (!canAccess) {
    return res.status(403).json({ error: 'Thread access denied' });
  }

  // Record the attachment view
  const { error: insertError } = await serviceSupabase
    .from('chat_attachment_reads')
    .upsert(
      {
        attachment_id: attachmentId,
        viewer_source: actor.source,
        viewer_id: actor.dbId,
        role_id: actor.roleId,
        viewer_name: actor.name,
        badge_number: actor.badgeNumber,
        opened_at: new Date().toISOString()
      },
      { onConflict: 'attachment_id,viewer_source,viewer_id' }
    );

  if (insertError) {
    return res.status(500).json({ error: insertError.message });
  }

  return res.status(200).json({ ok: true });
});

export default router;
