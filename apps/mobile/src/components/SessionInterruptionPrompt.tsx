import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Feather } from '@expo/vector-icons';

// 'discarded' is a prompt-only variant (discarding a saved unfinished draft
// from Home); it is recorded as a 'cancelled' interruption.
export type SessionInterruptionPromptKind = 'cancelled' | 'navigated_away' | 'discarded';

interface Props {
  visible: boolean;
  kind: SessionInterruptionPromptKind;
  saving: boolean;
  /** Confirmed with a reason — the session will now end / navigation proceeds. */
  onSubmit: (reason: string) => void;
  /** Backed out of the prompt — the officer stays in the session. */
  onStay: () => void;
}

const COPY: Record<
  SessionInterruptionPromptKind,
  { title: string; body: string; confirm: string; stay: string }
> = {
  cancelled: {
    title: 'Cancel test session',
    body: 'You are about to cancel this test session. A reason is required and will be recorded for supervisor review.',
    confirm: 'Submit reason & cancel session',
    stay: 'Stay in session'
  },
  navigated_away: {
    title: 'Leave test session?',
    body: 'You are leaving an unfinished test session. A reason is required and will be recorded for supervisor review.',
    confirm: 'Submit reason & leave',
    stay: 'Stay in session'
  },
  discarded: {
    title: 'Discard unfinished test',
    body: 'You are about to discard a saved unfinished test. A reason is required and will be recorded for supervisor review.',
    confirm: 'Submit reason & discard',
    stay: 'Keep unfinished test'
  }
};

export function SessionInterruptionPrompt({ visible, kind, saving, onSubmit, onStay }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const copy = COPY[kind];
  const canSubmit = reason.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onStay}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Feather name="alert-triangle" size={20} color="#b45309" />
            <Text style={styles.title}>{copy.title}</Text>
          </View>

          <Text style={styles.body}>{copy.body}</Text>

          <Text style={styles.label}>REASON *</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g., Driver refused the test, equipment fault, safety concern..."
            placeholderTextColor="#94a3b8"
            multiline
            numberOfLines={4}
            style={styles.input}
            textAlignVertical="top"
            editable={!saving}
          />

          <View style={styles.actions}>
            <Pressable
              style={styles.stayButton}
              onPress={() => {
                Keyboard.dismiss();
                onStay();
              }}
              disabled={saving}
            >
              <Text style={styles.stayText}>{copy.stay}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmButton, !canSubmit && styles.confirmDisabled]}
              onPress={() => {
                Keyboard.dismiss();
                if (canSubmit) onSubmit(reason.trim());
              }}
              disabled={!canSubmit}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmText}>{copy.confirm}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 420,
    padding: 24
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  body: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    marginBottom: 20
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 14,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 100,
    marginBottom: 20
  },
  actions: {
    flexDirection: 'column',
    gap: 10
  },
  stayButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  stayText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569'
  },
  confirmButton: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#b45309',
    alignItems: 'center',
    justifyContent: 'center'
  },
  confirmDisabled: {
    opacity: 0.5
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center'
  }
});
