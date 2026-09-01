import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { colors } from '../styles/colors';
import { useAuth } from '../lib/AuthContext';
import { OfficerBottomNav } from '../components/OfficerBottomNav';
import { ChatAttachmentUpload } from '../components/ChatAttachmentUpload';
import { ChatAttachmentsDisplay } from '../components/ChatAttachmentsDisplay';
import {
  createEmergencyChatThread,
  getChatOfficerContacts,
  getChatThreadMessages,
  getChatThreads,
  sendChatMessage
} from '../services/api';
import type { ChatMessage, ChatOfficerContact, ChatThreadSummary } from '../types';
import { hasSupabaseRealtimeConfig, supabaseRealtime } from '../lib/supabaseRealtime';

type RootStackParamList = {
  OfficerDashboard: undefined;
  OfficerReports: undefined;
  OfficerShifts: undefined;
  EmergencyChat: undefined;
  Audit: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'EmergencyChat'>;

function formatStamp(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function roleLabel(roleId: number): string {
  if (roleId === 3) return 'Admin';
  if (roleId === 2) return 'Supervisor';
  return 'Officer';
}

function threadTitle(thread: ChatThreadSummary, selfOfficerId?: number): string {
  if (thread.title?.trim()) {
    return thread.title.trim();
  }

  const others = (thread.participants ?? [])
    .filter((participant) => !(participant.source === 'officer_users' && participant.participantId === selfOfficerId))
    .map((participant) => participant.name);

  if (others.length === 0) {
    return 'Emergency channel';
  }

  if (others.length === 1) {
    return others[0];
  }

  return `${others[0]} +${others.length - 1}`;
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
  const officersSeenCount = Number.isFinite(message.officersSeenCount)
    ? message.officersSeenCount
    : seenBy.filter((viewer) => viewer.roleId === 1).length;
  const superUsersSeenCount = Number.isFinite(message.superUsersSeenCount)
    ? message.superUsersSeenCount
    : seenBy.filter((viewer) => viewer.roleId === 2 || viewer.roleId === 3).length;
  const parsedSeenCount = Number(message.seenCount);
  const seenCount = Number.isFinite(parsedSeenCount) ? parsedSeenCount : seenBy.length;

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

export function EmergencyChatScreen(_props: Props) {
  const { profile, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [contacts, setContacts] = useState<ChatOfficerContact[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [selectedOfficerIds, setSelectedOfficerIds] = useState<number[]>([]);
  const [officerSearch, setOfficerSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [composerPriority, setComposerPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [composerAttachments, setComposerAttachments] = useState<Array<{ fileName: string; fileType: string; fileSize: number; storagePath: string; storageUrl: string }>>([]);
  const [expandedSeenMessageIds, setExpandedSeenMessageIds] = useState<number[]>([]);
  const [mobileView, setMobileView] = useState<'channels' | 'chat'>('channels');
  const [showOfficerPicker, setShowOfficerPicker] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  const visibleContacts = useMemo(() => {
    const query = officerSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) => `${contact.name} ${contact.badgeNumber}`.toLowerCase().includes(query));
  }, [contacts, officerSearch]);

  const refreshThreads = useCallback(async () => {
    const [threadRows, officerContacts] = await Promise.all([
      getChatThreads(),
      getChatOfficerContacts()
    ]);
    const normalizedThreads = (threadRows ?? [])
      .map(normalizeThread)
      .filter((thread) => thread.latestMessage !== null);
    setThreads(normalizedThreads);
    setContacts(officerContacts.filter((contact) => contact.officerId !== profile?.officerId));
    if (!selectedThreadId && normalizedThreads.length > 0) {
      setSelectedThreadId(normalizedThreads[0].id);
    }
  }, [profile?.officerId, selectedThreadId]);

  const refreshMessages = useCallback(async (
    threadId: string,
    options?: { silent?: boolean; markRead?: boolean }
  ) => {
    const silent = options?.silent === true;
    const markRead = options?.markRead !== false;
    if (!silent) {
      setIsLoadingMessages(true);
    }
    try {
      const data = await getChatThreadMessages(threadId, 120, markRead);
      setMessages((data ?? []).map(normalizeMessage));
    } finally {
      if (!silent) {
        setIsLoadingMessages(false);
      }
    }
  }, []);

  const triggerEmergencyNotificationHook = useCallback((message: ChatMessage) => {
    if (!message.isEmergency) return;
    if (message.sender.source === 'officer_users' && message.sender.participantId === profile?.officerId) {
      return;
    }

    // Push-notification-ready hook for future Expo Notifications integration.
    console.log('[chat:emergency-alert]', {
      threadId: message.threadId,
      sender: message.sender.name,
      body: message.body,
      createdAt: message.createdAt
    });
  }, [profile?.officerId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        setLoading(true);
        try {
          await refreshThreads();
          setError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load emergency chat';
          setError(message === 'Not found'
            ? 'Chat endpoint not found. Confirm mobile API points to backend with chat routes and restart backend.'
            : message);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void load();

      let removeRealtime: (() => void) | null = null;
      const interval: ReturnType<typeof setInterval> = setInterval(() => {
        void refreshThreads();
        if (selectedThreadId) {
          void refreshMessages(selectedThreadId, { silent: true, markRead: false });
        }
      }, 12000);

      if (hasSupabaseRealtimeConfig && supabaseRealtime) {
        const channel = supabaseRealtime
          .channel('mobile-chat-messages')
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
                await refreshMessages(threadId, { silent: true, markRead: true });
              }
              await refreshThreads();

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
                  attachments: [],
                  createdAt: row.created_at
                });
              }
            }
          )
          .subscribe();

        removeRealtime = () => {
          void supabaseRealtime?.removeChannel(channel);
        };
      }

      return () => {
        active = false;
        removeRealtime?.();
        clearInterval(interval);
      };
    }, [refreshThreads, refreshMessages, selectedThreadId, triggerEmergencyNotificationHook])
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedThreadId) {
        setMessages([]);
        return;
      }
      void refreshMessages(selectedThreadId);
    }, [refreshMessages, selectedThreadId])
  );

  const toggleOfficerSelection = (officerId: number) => {
    setSelectedOfficerIds((current) => {
      if (current.includes(officerId)) {
        return current.filter((id) => id !== officerId);
      }
      return [...current, officerId];
    });
  };

  const handleCreateThread = async () => {
    if (selectedOfficerIds.length === 0) {
      setError('Select at least one officer.');
      return;
    }

    try {
      const created = await createEmergencyChatThread({
        officerIds: selectedOfficerIds,
        includeSuperUsers: true,
        title: selectedOfficerIds.length === 1 ? 'Emergency channel' : `Emergency group (${selectedOfficerIds.length} officers)`
      });
      setSelectedThreadId(created.id);
      setMobileView('chat');
      setSelectedOfficerIds([]);
      setOfficerSearch('');
      await refreshThreads();
      await refreshMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start emergency channel');
    }
  };

  const handleEscalateToSuperUsers = async () => {
    try {
      const created = await createEmergencyChatThread({
        includeSuperUsers: true,
        title: 'Emergency escalation'
      });
      setSelectedThreadId(created.id);
      setMobileView('chat');
      setSelectedOfficerIds([]);
      setOfficerSearch('');
      await refreshThreads();
      await refreshMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create superuser escalation channel');
    }
  };

  const handleBroadcastEveryone = async () => {
    try {
      const created = await createEmergencyChatThread({
        sendToEveryone: true,
        title: 'Emergency broadcast to all officers and superusers'
      });
      setSelectedThreadId(created.id);
      setMobileView('chat');
      setSelectedOfficerIds([]);
      setOfficerSearch('');
      await refreshThreads();
      await refreshMessages(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create everyone broadcast');
    }
  };

  const handleSend = async () => {
    if (!selectedThreadId) return;
    const text = composerText.trim();
    if (!text && composerAttachments.length === 0) return;
    try {
      await sendChatMessage(selectedThreadId, text, true, composerPriority, replyToMessage?.id ?? null, composerAttachments);
      setComposerText('');
      setComposerAttachments([]);
      setReplyToMessage(null);
      await refreshMessages(selectedThreadId);
      await refreshThreads();
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

  const selfOfficerId = profile?.officerId;

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerBadge}>
            <Feather name="alert-octagon" size={18} color="#fff" />
          </View>
          <View>
            <Text style={styles.headerLabel}>EMERGENCY CHAT</Text>
            <Text style={styles.headerSubtitle}>Officer channel and supervisor escalation</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.main} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primaryDark} />
        </View>
      ) : (
        <View style={styles.content}>
          {!token && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerText}>
                Chat requires online sign-in. Please sign in with network access to receive and send emergency messages.
              </Text>
            </View>
          )}
          <View style={styles.modeSwitchRow}>
            <Pressable
              style={[styles.modeSwitchButton, mobileView === 'channels' && styles.modeSwitchButtonActive]}
              onPress={() => setMobileView('channels')}
            >
              <Text style={[styles.modeSwitchText, mobileView === 'channels' && styles.modeSwitchTextActive]}>Channels</Text>
            </Pressable>
            <Pressable
              style={[styles.modeSwitchButton, mobileView === 'chat' && styles.modeSwitchButtonActive]}
              onPress={() => {
                setMobileView('chat');
              }}
            >
              <Text style={[styles.modeSwitchText, mobileView === 'chat' && styles.modeSwitchTextActive]}>Chat</Text>
            </Pressable>
          </View>

          {mobileView === 'channels' && (
          <View style={styles.newThreadRow}>
            <TextInput
              value={officerSearch}
              onChangeText={setOfficerSearch}
              placeholder="Search officer by name or badge"
              placeholderTextColor="#94a3b8"
              style={styles.input}
              autoCapitalize="characters"
            />
            <Pressable style={styles.actionButton} onPress={() => { void handleCreateThread(); }}>
              <Text style={styles.actionButtonText}>Start</Text>
            </Pressable>
          </View>
          )}
          {mobileView === 'channels' && (
          <Pressable style={styles.pickerToggleButton} onPress={() => setShowOfficerPicker((current) => !current)}>
            <Text style={styles.pickerToggleText}>
              {showOfficerPicker ? 'Hide traffic officers list' : 'Show traffic officers list'}
            </Text>
          </Pressable>
          )}
          {mobileView === 'channels' && showOfficerPicker && (
          <View style={styles.selectorList}>
            <FlatList
              data={visibleContacts}
              keyExtractor={(item) => String(item.officerId)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = selectedOfficerIds.includes(item.officerId);
                return (
                  <Pressable
                    onPress={() => toggleOfficerSelection(item.officerId)}
                    style={[styles.selectorRow, selected && styles.selectorRowSelected]}
                  >
                    <View style={styles.selectorNameWrap}>
                      <Text style={styles.selectorName}>{item.name}</Text>
                      <Text style={styles.selectorRole}>Officer</Text>
                    </View>
                    <Text style={styles.selectorBadge}>{item.badgeNumber}</Text>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.selectorEmpty}>No officers matched your search.</Text>}
            />
          </View>
          )}
          {mobileView === 'channels' && (
          <Pressable style={styles.secondaryButton} onPress={() => { void handleEscalateToSuperUsers(); }}>
            <Text style={styles.secondaryButtonText}>Escalate To Superusers</Text>
          </Pressable>
          )}
          {mobileView === 'channels' && (
          <Pressable style={styles.broadcastButton} onPress={() => { void handleBroadcastEveryone(); }}>
            <Text style={styles.broadcastButtonText}>Broadcast To Everyone (Officers + Superusers)</Text>
          </Pressable>
          )}

          <View style={styles.body}>
            {mobileView === 'channels' && (
            <View style={styles.threadsColumn}>
              <Text style={styles.sectionLabel}>Channels</Text>
              <FlatList
                data={threads}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const active = item.id === selectedThreadId;
                  return (
                    <Pressable
                      onPress={() => {
                        setSelectedThreadId(item.id);
                        setMobileView('chat');
                      }}
                      style={[styles.threadCard, active && styles.threadCardActive]}
                    >
                      <Text style={styles.threadTitle}>{threadTitle(item, selfOfficerId)}</Text>
                      <Text numberOfLines={1} style={styles.threadPreview}>
                        {item.latestMessage?.body ?? 'No messages yet'}
                      </Text>
                      <View style={styles.threadMeta}>
                        <Text style={styles.threadTime}>
                          {item.latestMessage ? formatStamp(item.latestMessage.createdAt) : '--:--'}
                        </Text>
                        {item.unreadCount > 0 && (
                          <View style={styles.unreadPill}>
                            <Text style={styles.unreadPillText}>{item.unreadCount}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
              />
            </View>
            )}

            {mobileView === 'chat' && (
              <View style={styles.messagesColumn}>
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.sectionLabel}>{selectedThread ? threadTitle(selectedThread, selfOfficerId) : 'Select channel'}</Text>
                  <View style={styles.chatHeaderActions}>
                    <Pressable style={styles.backToChannelsButton} onPress={() => setShowParticipants((current) => !current)}>
                      <Text style={styles.backToChannelsText}>{showParticipants ? 'Hide people' : 'People'}</Text>
                    </Pressable>
                    <Pressable style={styles.backToChannelsButton} onPress={() => setMobileView('channels')}>
                      <Text style={styles.backToChannelsText}>Channels</Text>
                    </Pressable>
                  </View>
                </View>
                {selectedThread && showParticipants && (
                  <View style={styles.participantsWrap}>
                    {selectedThread.participants.map((participant) => (
                      <View key={`${participant.source}:${participant.participantId}`} style={styles.participantChip}>
                        <Text style={styles.participantChipText}>{participant.name} · {roleLabel(participant.roleId)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {isLoadingMessages ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator size="small" color={colors.primaryDark} />
                  </View>
                ) : (
                  <FlatList
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesListContent}
                    data={messages}
                    keyExtractor={(item) => String(item.id)}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                      const isMine = item.sender.source === 'officer_users' && item.sender.participantId === selfOfficerId;
                      const showSeenDetails = expandedSeenMessageIds.includes(item.id);
                      const seenBy = item.seenBy ?? [];
                      const parsedSeenCount = Number(item.seenCount);
                      const seenCount = Number.isFinite(parsedSeenCount) ? parsedSeenCount : seenBy.length;
                      const priorityStyle = item.priority === 'high'
                        ? styles.messageHigh
                        : item.priority === 'medium'
                          ? styles.messageMedium
                          : styles.messageLow;
                      return (
                        <View style={[styles.messageBubble, isMine ? styles.messageMine : styles.messageOther, priorityStyle]}>
                          <Text style={styles.messageSender}>{item.sender.name} · {roleLabel(item.sender.roleId)}</Text>
                          {item.replyTo && (
                            <View style={styles.replyPreview}>
                              <Text style={styles.replyPreviewTitle}>Reply to {item.replyTo.senderName}</Text>
                              <Text numberOfLines={1} style={styles.replyPreviewText}>{item.replyTo.body}</Text>
                            </View>
                          )}
                          <Text style={styles.messagePriority}>Priority: {item.priority.toUpperCase()}</Text>
                          <Text style={styles.messageText}>{item.body}</Text>
                          <ChatAttachmentsDisplay attachments={item.attachments || []} />
                          <View style={styles.messageActionsRow}>
                            <Pressable style={styles.messageActionButton} onPress={() => setReplyToMessage(item)}>
                              <Text style={styles.messageActionButtonText}>Reply</Text>
                            </Pressable>
                            <Pressable
                              style={styles.messageActionButton}
                              onPress={() => {
                                if (seenCount > 0) {
                                  toggleSeenDetails(item.id);
                                }
                              }}
                              disabled={seenCount === 0}
                            >
                              <Text style={styles.messageActionButtonText}>
                                {showSeenDetails ? `Seen ${seenCount} Hide` : `Seen ${seenCount} View`}
                              </Text>
                            </Pressable>
                          </View>
                          {showSeenDetails && seenBy.length > 0 && (
                            <View style={styles.seenListWrap}>
                              {seenBy.map((viewer) => (
                                <Text key={`${item.id}-${viewer.source}-${viewer.participantId}`} style={styles.seenListText}>
                                  {viewer.name} · {roleLabel(viewer.roleId)} · {formatStamp(viewer.readAt)}
                                </Text>
                              ))}
                            </View>
                          )}
                          <Text style={styles.messageTime}>{formatStamp(item.createdAt)}</Text>
                        </View>
                      );
                    }}
                  />
                )}

                {replyToMessage && (
                  <View style={styles.replyComposerPreview}>
                    <View style={styles.replyComposerHeader}>
                      <Text style={styles.replyComposerTitle}>Replying to {replyToMessage.sender.name}</Text>
                      <Pressable onPress={() => setReplyToMessage(null)}>
                        <Text style={styles.replyComposerCancel}>Cancel</Text>
                      </Pressable>
                    </View>
                    <Text numberOfLines={1} style={styles.replyComposerBody}>{replyToMessage.body}</Text>
                  </View>
                )}

                <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                  <ChatAttachmentUpload 
                    onFilesSelected={setComposerAttachments}
                    disabled={!selectedThreadId}
                    maxFiles={5}
                  />
                </View>

                <View style={styles.composerRow}>
                  <View style={styles.priorityPickerRow}>
                    <Pressable
                      style={[styles.priorityPill, composerPriority === 'high' && styles.priorityPillHigh]}
                      onPress={() => setComposerPriority('high')}
                    >
                      <Text style={[styles.priorityPillText, composerPriority === 'high' && styles.priorityPillTextActive]}>High</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.priorityPill, composerPriority === 'medium' && styles.priorityPillMedium]}
                      onPress={() => setComposerPriority('medium')}
                    >
                      <Text style={[styles.priorityPillText, composerPriority === 'medium' && styles.priorityPillTextActive]}>Medium</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.priorityPill, composerPriority === 'low' && styles.priorityPillLow]}
                      onPress={() => setComposerPriority('low')}
                    >
                      <Text style={[styles.priorityPillText, composerPriority === 'low' && styles.priorityPillTextActive]}>Low</Text>
                    </Pressable>
                  </View>
                  <View style={styles.composerInputRow}>
                    <TextInput
                      value={composerText}
                      onChangeText={setComposerText}
                      placeholder="Emergency message"
                      placeholderTextColor="#94a3b8"
                      style={styles.composerInput}
                    />
                    <Pressable style={styles.actionButton} onPress={() => { void handleSend(); }}>
                      <Text style={styles.actionButtonText}>Send</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      )}
      </KeyboardAvoidingView>

      <OfficerBottomNav active="EmergencyChat" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBackground
  },
  main: {
    flex: 1
  },
  header: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700'
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 10,
    paddingBottom: 8,
    minHeight: 0
  },
  body: {
    flex: 1,
    minHeight: 0,
    gap: 10
  },
  modeSwitchRow: {
    flexDirection: 'row',
    gap: 8
  },
  modeSwitchButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  modeSwitchButtonActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark
  },
  modeSwitchText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700'
  },
  modeSwitchTextActive: {
    color: '#fff'
  },
  threadsColumn: {
    flex: 1,
    minHeight: 160,
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 10
  },
  messagesColumn: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 10
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  chatHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  backToChannelsButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  backToChannelsText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700'
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  newThreadRow: {
    flexDirection: 'row',
    gap: 8
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 13
  },
  actionButton: {
    backgroundColor: colors.primaryDark,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center'
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700'
  },
  broadcastButton: {
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center'
  },
  broadcastButtonText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '700'
  },
  selectorList: {
    maxHeight: 132,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.background
  },
  pickerToggleButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    alignItems: 'center'
  },
  pickerToggleText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700'
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  selectorNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  selectorRowSelected: {
    backgroundColor: '#e0f2fe'
  },
  selectorName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600'
  },
  selectorRole: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  selectorBadge: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  selectorEmpty: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.textSecondary,
    fontSize: 12
  },
  threadCard: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: colors.background
  },
  threadCardActive: {
    borderColor: colors.primaryDark,
    backgroundColor: '#eef4fb'
  },
  threadTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700'
  },
  threadPreview: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3
  },
  threadMeta: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  threadTime: {
    color: colors.neutralGray,
    fontSize: 11
  },
  unreadPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center'
  },
  unreadPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700'
  },
  participantsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8
  },
  messagesList: {
    flex: 1,
    minHeight: 0
  },
  messagesListContent: {
    paddingBottom: 8
  },
  participantChip: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  participantChipText: {
    color: '#334155',
    fontSize: 11
  },
  messageBubble: {
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    maxWidth: '90%'
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#dbeafe'
  },
  messageOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9'
  },
  messageSender: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700'
  },
  messagePriority: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 13,
    marginTop: 2
  },
  messageTime: {
    color: colors.neutralGray,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right'
  },
  messageActionsRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  messageActionButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  messageActionButtonText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700'
  },
  messageSeenText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600'
  },
  seenListWrap: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  seenListText: {
    color: '#334155',
    fontSize: 11,
    marginBottom: 2
  },
  replyPreview: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  replyPreviewTitle: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700'
  },
  replyPreviewText: {
    color: '#334155',
    fontSize: 11,
    marginTop: 1
  },
  replyComposerPreview: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  replyComposerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  replyComposerTitle: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700'
  },
  replyComposerCancel: {
    color: '#1e293b',
    fontSize: 11,
    fontWeight: '700'
  },
  replyComposerBody: {
    marginTop: 4,
    color: '#475569',
    fontSize: 12
  },
  composerRow: {
    marginTop: 8,
    flexDirection: 'column',
    gap: 8
  },
  composerInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  priorityPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center'
  },
  priorityPill: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f8fafc'
  },
  priorityPillText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700'
  },
  priorityPillTextActive: {
    color: '#fff'
  },
  priorityPillHigh: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626'
  },
  priorityPillMedium: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b'
  },
  priorityPillLow: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a'
  },
  messageHigh: {
    borderWidth: 1,
    borderColor: '#f87171',
    backgroundColor: '#fee2e2'
  },
  messageMedium: {
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#ffedd5'
  },
  messageLow: {
    borderWidth: 1,
    borderColor: '#86efac',
    backgroundColor: '#dcfce7'
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    fontSize: 13
  },
  errorText: {
    color: colors.error,
    fontSize: 12,
    marginTop: 4
  },
  offlineBanner: {
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  offlineBannerText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '600'
  }
});
