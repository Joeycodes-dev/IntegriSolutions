import { useEffect, useMemo, useState } from 'react';
import {
  createEmergencyChatThread,
  getChatOfficerContacts,
  getChatThreadMessages,
  getChatThreads,
  sendChatMessage
} from '../../services/api';
import type { ChatMessage, ChatOfficerContact, ChatThreadSummary, UserProfile } from '../../types';
import { hasSupabaseRealtimeConfig, supabaseRealtime } from '../../lib/supabaseRealtime';
import { ChatAttachmentUpload } from './ChatAttachmentUpload';
import { ChatAttachmentsDisplay } from './ChatAttachmentsDisplay';

interface Props {
  profile: UserProfile | null;
}

function formatTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function roleLabel(roleId: number): string {
  if (roleId === 3) return 'Admin';
  if (roleId === 2) return 'Supervisor';
  return 'Officer';
}

function normalizeThread(thread: ChatThreadSummary): ChatThreadSummary {
  return {
    ...thread,
    unreadCount: Number.isFinite(thread.unreadCount) ? thread.unreadCount : 0,
    participants: Array.isArray(thread.participants) ? thread.participants : [],
    latestMessage: thread.latestMessage ?? null
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  const seenBy = Array.isArray(message.seenBy) ? message.seenBy : [];
  const parsedSeenCount = Number(message.seenCount);
  const seenCount = Number.isFinite(parsedSeenCount) ? parsedSeenCount : seenBy.length;
  const officersSeenCount = Number.isFinite(message.officersSeenCount)
    ? message.officersSeenCount
    : seenBy.filter((viewer) => viewer.roleId === 1).length;
  const superUsersSeenCount = Number.isFinite(message.superUsersSeenCount)
    ? message.superUsersSeenCount
    : seenBy.filter((viewer) => viewer.roleId === 2 || viewer.roleId === 3).length;

  return {
    ...message,
    replyToMessageId: message.replyToMessageId ?? null,
    replyTo: message.replyTo ?? null,
    seenCount,
    officersSeenCount,
    superUsersSeenCount,
    seenBy
  };
}

function threadTitle(thread: ChatThreadSummary, selfProfile?: UserProfile | null): string {
  if (thread.title?.trim()) {
    return thread.title.trim();
  }

  const ownParticipantId = selfProfile?.officerId;
  const names = (thread.participants ?? [])
    .filter((participant) => participant.participantId !== ownParticipantId)
    .map((participant) => participant.name);

  if (!names.length) return 'Emergency channel';
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export function EmergencyChatPanel({ profile }: Props) {
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [contacts, setContacts] = useState<ChatOfficerContact[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<number[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [composerPriority, setComposerPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<Array<{ fileName: string; fileType: string; fileSize: number; storagePath: string; storageUrl: string }>>([]);
  const [expandedSeenMessageIds, setExpandedSeenMessageIds] = useState<number[]>([]);
  const [showOfficerPicker, setShowOfficerPicker] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const ownParticipantId = profile?.officerId;
  const isOfficerUser = profile?.roleId === 1;

  const visibleContacts = useMemo(() => {
    const query = officerSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => `${contact.name} ${contact.badgeNumber}`.toLowerCase().includes(query));
  }, [contacts, officerSearch]);

  async function loadThreadsAndContacts() {
    const [threadRows, officerContacts] = await Promise.all([
      getChatThreads(),
      getChatOfficerContacts()
    ]);
    const normalizedThreads = (threadRows ?? [])
      .map(normalizeThread)
      .filter((thread) => thread.latestMessage !== null);
    setThreads(normalizedThreads);
    setContacts(officerContacts.filter((contact) => contact.officerId !== ownParticipantId));
    if (!selectedThreadId && normalizedThreads.length) {
      setSelectedThreadId(normalizedThreads[0].id);
    }
  }

  async function loadMessages(threadId: string) {
    const rows = await getChatThreadMessages(threadId, 120, true);
    setMessages((rows ?? []).map(normalizeMessage));
  }

  function triggerEmergencyNotificationHook(message: ChatMessage) {
    if (!message.isEmergency) return;
    if (message.sender.participantId === ownParticipantId) return;

    // Push-notification-ready hook for future browser/FCM integration.
    console.log('[chat:emergency-alert:web]', {
      threadId: message.threadId,
      sender: message.sender.name,
      body: message.body,
      createdAt: message.createdAt
    });
  }

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        await loadThreadsAndContacts();
        setError(null);
      } catch (err) {
        if (mounted) {
          const message = err instanceof Error ? err.message : 'Failed to load chat';
          setError(message === 'Not found'
            ? 'Chat endpoint not found. Confirm web API points to the backend with chat routes and restart backend.'
            : message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    let removeRealtime: (() => void) | null = null;
    const interval = window.setInterval(() => {
      void loadThreadsAndContacts();
      if (selectedThreadId) {
        void loadMessages(selectedThreadId);
      }
    }, 7000);

    if (hasSupabaseRealtimeConfig && supabaseRealtime) {
      const channel = supabaseRealtime
        .channel('web-chat-messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          async (payload) => {
            const row = payload.new as {
              thread_id?: string;
              id?: number;
              body?: string;
              sender_source?: 'officer_users' | 'supervisor_users' | 'admin_users';
              sender_id?: number;
              sender_role_id?: number;
              sender_name?: string;
              is_emergency?: boolean;
              priority?: 'high' | 'medium' | 'low';
              created_at?: string;
            };

            const threadId = row.thread_id;
            if (!threadId) return;

            if (selectedThreadId === threadId) {
              await loadMessages(threadId);
            }
            await loadThreadsAndContacts();

            if (row.id && row.body && row.sender_source && row.sender_id && row.sender_role_id && row.sender_name && row.created_at) {
              triggerEmergencyNotificationHook({
                id: row.id,
                threadId,
                replyToMessageId: null,
                replyTo: null,
                body: row.body,
                sender: {
                  source: row.sender_source,
                  participantId: row.sender_id,
                  roleId: row.sender_role_id,
                  name: row.sender_name
                },
                isEmergency: row.is_emergency !== false,
                priority: row.priority ?? 'medium',
                seenCount: 0,
                officersSeenCount: 0,
                superUsersSeenCount: 0,
                seenBy: [],
                createdAt: row.created_at
              });
            }
          }
        )
        .subscribe();

      removeRealtime = () => {
        void supabaseRealtime.removeChannel(channel);
      };
    }

    return () => {
      mounted = false;
      removeRealtime?.();
      window.clearInterval(interval);
    };
  }, [selectedThreadId, ownParticipantId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [selectedThreadId]);

  const toggleOfficerSelection = (officerId: number) => {
    setSelectedOfficerIds((current) => {
      if (current.includes(officerId)) {
        return current.filter((id) => id !== officerId);
      }
      return [...current, officerId];
    });
  };

  const createThread = async () => {
    if (selectedOfficerIds.length === 0) {
      setError('Select at least one officer.');
      return;
    }

    try {
      const created = await createEmergencyChatThread({
        officerIds: selectedOfficerIds,
        includeSuperUsers: isOfficerUser,
        title: selectedOfficerIds.length === 1 ? 'Emergency channel' : `Emergency group (${selectedOfficerIds.length} officers)`
      });
      setSelectedOfficerIds([]);
      setOfficerSearch('');
      setSelectedThreadId(created.id);
      await loadThreadsAndContacts();
      await loadMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create emergency channel');
    }
  };

  const broadcastAllOfficers = async () => {
    try {
      const created = await createEmergencyChatThread({
        sendToAllOfficers: true,
        title: 'Emergency broadcast'
      });
      setSelectedThreadId(created.id);
      await loadThreadsAndContacts();
      await loadMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to broadcast emergency channel');
    }
  };

  const broadcastEveryone = async () => {
    try {
      const created = await createEmergencyChatThread({
        sendToEveryone: true,
        title: 'Emergency broadcast to all officers and superusers'
      });
      setSelectedThreadId(created.id);
      await loadThreadsAndContacts();
      await loadMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create everyone broadcast');
    }
  };

  const send = async () => {
    if (!selectedThreadId) return;
    const body = composer.trim();
    if (!body && composerAttachments.length === 0) return;

    try {
      await sendChatMessage(selectedThreadId, body, true, composerPriority, replyToMessage?.id ?? null, composerAttachments);
      setComposer('');
      setComposerAttachments([]);
      setReplyToMessage(null);
      await loadMessages(selectedThreadId);
      await loadThreadsAndContacts();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const toggleSeenDetails = (messageId: number) => {
    setExpandedSeenMessageIds((current) => {
      if (current.includes(messageId)) {
        return current.filter((id) => id !== messageId);
      }
      return [...current, messageId];
    });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">Emergency Chat</h2>
        <p className="text-sm text-slate-600">Officer coordination and supervisor command messaging</p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">Loading chat...</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center gap-2">
              <input
                value={officerSearch}
                onChange={(event) => setOfficerSearch(event.target.value)}
                placeholder="Search officer by name or badge"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => void createThread()}
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Start
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowOfficerPicker((current) => !current)}
              className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              {showOfficerPicker ? 'Hide traffic officers list' : 'Show traffic officers list'}
            </button>

            {showOfficerPicker && (
              <div className="mb-3 max-h-52 overflow-y-auto rounded-md border border-slate-200">
                {visibleContacts.map((contact) => {
                  const checked = selectedOfficerIds.includes(contact.officerId);
                  return (
                    <label key={contact.officerId} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOfficerSelection(contact.officerId)}
                      />
                      <span className="font-medium text-slate-800">{contact.name}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Officer</span>
                      <span className="ml-auto text-xs text-slate-500">{contact.badgeNumber}</span>
                    </label>
                  );
                })}
                {visibleContacts.length === 0 && (
                  <p className="px-3 py-3 text-sm text-slate-500">No officers matched your search.</p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void broadcastAllOfficers()}
              className="mb-3 w-full rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              Broadcast To All Officers
            </button>

            <button
              type="button"
              onClick={() => void broadcastEveryone()}
              className="mb-3 w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"
            >
              Broadcast To Everyone (Officers + Superusers)
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {threads.length === 0 && (
                <p className="text-sm text-slate-500">No emergency channels yet.</p>
              )}

              {threads.map((thread) => {
                const active = thread.id === selectedThreadId;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                    }}
                    className={`mb-2 w-full rounded-lg border px-3 py-2 text-left transition ${
                      active
                        ? 'border-sky-500 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">{threadTitle(thread, profile)}</p>
                    <p className="truncate text-xs text-slate-600">{thread.latestMessage?.body ?? 'No messages yet'}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        {thread.latestMessage ? formatTime(thread.latestMessage.createdAt) : '--:--'}
                      </span>
                      {thread.unreadCount > 0 && (
                        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedThread ? threadTitle(selectedThread, profile) : 'Select a channel'}
              </h3>
              {selectedThread && (
                <button
                  type="button"
                  onClick={() => setShowParticipants((current) => !current)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
                >
                  {showParticipants ? 'Hide people' : 'People'}
                </button>
              )}
            </div>

            {selectedThread && showParticipants && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {selectedThread.participants.map((participant) => (
                  <span
                    key={`${participant.source}:${participant.participantId}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    {participant.name} · {roleLabel(participant.roleId)}
                  </span>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {messages.map((message) => {
                const ownMessage = message.sender.participantId === ownParticipantId;
                const showSeenDetails = expandedSeenMessageIds.includes(message.id);
                const seenBy = message.seenBy ?? [];
                const parsedSeenCount = Number(message.seenCount);
                const seenCount = Number.isFinite(parsedSeenCount) ? parsedSeenCount : seenBy.length;
                const priorityClass = message.priority === 'high'
                  ? 'border border-rose-400 bg-rose-100'
                  : message.priority === 'medium'
                    ? 'border border-orange-300 bg-orange-50'
                    : 'border border-emerald-300 bg-emerald-50';
                return (
                  <div
                    key={message.id}
                    className={`mb-2 max-w-[85%] rounded-lg px-3 py-2 ${
                      ownMessage
                        ? 'ml-auto'
                        : 'mr-auto'
                    } ${priorityClass}`}
                  >
                    <p className="text-xs font-semibold text-slate-700">
                      {message.sender.name} · {roleLabel(message.sender.roleId)}
                    </p>
                    {message.replyTo && (
                      <div className="mt-1 rounded border border-slate-300 bg-white/70 px-2 py-1">
                        <p className="text-[10px] font-semibold text-slate-600">Reply to {message.replyTo.senderName}</p>
                        <p className="truncate text-[11px] text-slate-700">{message.replyTo.body}</p>
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                      Priority: {message.priority.toUpperCase()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{message.body}</p>
                    <ChatAttachmentsDisplay attachments={message.attachments || []} />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyToMessage(message)}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (seenCount > 0) {
                            toggleSeenDetails(message.id);
                          }
                        }}
                        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={seenCount === 0}
                      >
                        {showSeenDetails ? `Seen: ${seenCount} (Hide)` : `Seen: ${seenCount} (View)`}
                      </button>
                    </div>
                    {showSeenDetails && seenBy.length > 0 && (
                      <div className="mt-2 rounded border border-slate-300 bg-white/80 px-2 py-1.5">
                        {seenBy.map((viewer) => (
                          <p key={`${message.id}-${viewer.source}-${viewer.participantId}`} className="text-[11px] text-slate-700">
                            {viewer.name} · {roleLabel(viewer.roleId)} · {formatTime(viewer.readAt)}
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-right text-[11px] text-slate-500">{formatTime(message.createdAt)}</p>
                  </div>
                );
              })}
            </div>

            {replyToMessage && (
              <div className="mt-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-700">Replying to {replyToMessage.sender.name}</p>
                  <button
                    type="button"
                    onClick={() => setReplyToMessage(null)}
                    className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
                <p className="mt-1 truncate text-xs text-slate-600">{replyToMessage.body}</p>
              </div>
            )}

            <ChatAttachmentUpload 
              onFilesSelected={setComposerAttachments}
              disabled={!selectedThreadId}
              maxFiles={5}
            />

            <div className="mt-3 flex gap-2">
              <select
                value={composerPriority}
                onChange={(event) => setComposerPriority(event.target.value as 'high' | 'medium' | 'low')}
                className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700"
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <input
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                placeholder="Emergency message"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => void send()}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="border-t border-rose-200 bg-rose-50 px-6 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
    </section>
  );
}
