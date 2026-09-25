import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  deleteActiveTestDraft,
  getLatestActiveTestDraft,
  getTestById,
  saveActiveTestDraft,
} from '../db/repository';
import { deleteDraftAttachmentFiles } from '../services/activeTestDraftAttachments';
import {
  ACTIVE_TEST_DRAFT_SCHEMA_VERSION,
  parseActiveTestDraft,
  type ActiveTestDraftContent,
  type ActiveTestDraftPayload,
  type DraftOwner,
} from './activeTestDraft';
import { generateId } from './id';

export type ActiveTestDraftIssue = {
  id: string;
  message: string;
  updatedAt: string;
};

type ActiveTestDraftControllerOptions = {
  owner: DraftOwner | null;
  enabled: boolean;
  buildSnapshot: () => ActiveTestDraftContent;
  onStorageError?: (message: string) => void;
};

type ActiveTestDraftController = {
  activeDraft: ActiveTestDraftPayload | null;
  recoverableDraft: ActiveTestDraftPayload | null;
  recoveryIssue: ActiveTestDraftIssue | null;
  storageError: string | null;
  refresh: () => Promise<void>;
  adopt: (draft: ActiveTestDraftPayload) => void;
  schedulePersist: () => void;
  flush: () => Promise<void>;
  getDraftIdentity: () => {
    draftId: string;
    plannedTestId: string;
    createdAt: string;
  } | null;
  commit: () => Promise<void>;
  discard: (cleanupFiles?: boolean) => Promise<void>;
};

function errorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (message.trim() || fallback).slice(0, 500);
}

function isOwnerMatch(payloadOwner: DraftOwner, owner: DraftOwner): boolean {
  return (
    payloadOwner.ownerKey === owner.ownerKey &&
    (payloadOwner.officerId == null || owner.officerId == null || payloadOwner.officerId === owner.officerId) &&
    (payloadOwner.officerUid == null || owner.officerUid == null || payloadOwner.officerUid === owner.officerUid)
  );
}

export function useActiveTestDraftPersistence({
  owner,
  enabled,
  buildSnapshot,
  onStorageError,
}: ActiveTestDraftControllerOptions): ActiveTestDraftController {
  const ownerRef = useRef<DraftOwner | null>(owner);
  const enabledRef = useRef(enabled);
  const buildSnapshotRef = useRef(buildSnapshot);
  const onStorageErrorRef = useRef(onStorageError);

  const [activeDraft, setActiveDraft] = useState<ActiveTestDraftPayload | null>(null);
  const [recoverableDraft, setRecoverableDraft] = useState<ActiveTestDraftPayload | null>(null);
  const [recoveryIssue, setRecoveryIssue] = useState<ActiveTestDraftIssue | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const activeDraftRef = useRef<ActiveTestDraftPayload | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const plannedTestIdRef = useRef<string | null>(null);
  const createdAtRef = useRef<string | null>(null);
  const pendingContentRef = useRef<ActiveTestDraftContent | null>(null);
  const pendingOwnerRef = useRef<DraftOwner | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const terminalRef = useRef(false);
  const mountedRef = useRef(true);

  ownerRef.current = owner;
  enabledRef.current = enabled;
  buildSnapshotRef.current = buildSnapshot;
  onStorageErrorRef.current = onStorageError;

  const reportStorageError = useCallback((message: string) => {
    if (!mountedRef.current) return;
    setStorageError(message);
    onStorageErrorRef.current?.(message);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();

    const run = async (): Promise<void> => {
      const content = pendingContentRef.current;
      const currentOwner = activeDraftRef.current?.owner ?? pendingOwnerRef.current ?? ownerRef.current;
      if (!content || !currentOwner || terminalRef.current) return;

      pendingContentRef.current = null;
      pendingOwnerRef.current = null;
      const now = new Date().toISOString();
      const draftId = draftIdRef.current ?? generateId();
      const plannedTestId = plannedTestIdRef.current ?? generateId();
      const createdAt = createdAtRef.current ?? now;
      draftIdRef.current = draftId;
      plannedTestIdRef.current = plannedTestId;
      createdAtRef.current = createdAt;

      const draft: ActiveTestDraftPayload = {
        kind: 'active-test',
        schemaVersion: ACTIVE_TEST_DRAFT_SCHEMA_VERSION,
        draftId,
        plannedTestId,
        createdAt,
        updatedAt: now,
        owner: currentOwner,
        ...content,
      };

      activeDraftRef.current = draft;
      if (mountedRef.current) {
        setActiveDraft(draft);
        setRecoverableDraft(null);
        setRecoveryIssue(null);
      }

      try {
        const driverData = JSON.stringify(draft);
        parseActiveTestDraft(driverData);
        await saveActiveTestDraft({
          id: draft.draftId,
          owner: draft.owner,
          driverData,
          step: draft.step,
          payloadVersion: ACTIVE_TEST_DRAFT_SCHEMA_VERSION,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        });
        if (mountedRef.current) setStorageError(null);
      } catch (error) {
        // Keep the content pending so a later state change or lifecycle flush can retry it.
        pendingContentRef.current = content;
        pendingOwnerRef.current = currentOwner;
        reportStorageError(errorMessage(error, 'The active test could not be saved locally.'));
      }
    };

    const next = writeChainRef.current.then(run, run);
    writeChainRef.current = next.catch(() => undefined);
    await next;
  }, [clearTimer, reportStorageError]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  const refresh = useCallback(async (): Promise<void> => {
    const currentOwner = ownerRef.current;
    if (!currentOwner || activeDraftRef.current) {
      if (mountedRef.current) {
        setRecoverableDraft(null);
        setRecoveryIssue(null);
      }
      return;
    }

    try {
      const record = await getLatestActiveTestDraft(currentOwner);
      if (!record) {
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue(null);
        }
        return;
      }

      if (record.payloadVersion !== ACTIVE_TEST_DRAFT_SCHEMA_VERSION) {
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue({
            id: record.id,
            message: `Draft version ${record.payloadVersion} is not supported by this app version.`,
            updatedAt: record.updatedAt,
          });
        }
        return;
      }

      let parsed: ActiveTestDraftPayload;
      try {
        parsed = parseActiveTestDraft(record.driverData);
      } catch (error) {
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue({
            id: record.id,
            message: errorMessage(error, 'The saved test draft is damaged.'),
            updatedAt: record.updatedAt,
          });
        }
        return;
      }

      if (parsed.draftId !== record.id) {
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue({
            id: record.id,
            message: 'The saved test draft identity does not match its database record.',
            updatedAt: record.updatedAt,
          });
        }
        return;
      }

      if (!isOwnerMatch(parsed.owner, currentOwner)) {
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue({
            id: record.id,
            message: 'The saved test draft belongs to a different officer.',
            updatedAt: record.updatedAt,
          });
        }
        return;
      }

      // A process can die after the local record commit but before draft cleanup.
      // Treat that draft as already completed instead of creating a duplicate test.
      const savedRecord = await getTestById(parsed.plannedTestId);
      if (savedRecord) {
        if (
          currentOwner.officerId != null &&
          savedRecord.officerId !== currentOwner.officerId
        ) {
          if (mountedRef.current) {
            setRecoverableDraft(null);
            setRecoveryIssue({
              id: record.id,
              message: 'The planned test ID is already used by another officer.',
              updatedAt: record.updatedAt,
            });
          }
          return;
        }
        await deleteActiveTestDraft(record.id, currentOwner);
        if (mountedRef.current) {
          setRecoverableDraft(null);
          setRecoveryIssue(null);
        }
        return;
      }

      if (mountedRef.current) {
        setRecoverableDraft(parsed);
        setRecoveryIssue(null);
        setStorageError(null);
      }
    } catch (error) {
      reportStorageError(errorMessage(error, 'The saved test draft could not be read.'));
    }
  }, [reportStorageError]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const adopt = useCallback((draft: ActiveTestDraftPayload) => {
    const currentOwner = ownerRef.current;
    if (!currentOwner || !isOwnerMatch(draft.owner, currentOwner)) {
      reportStorageError('The saved test draft belongs to a different officer.');
      return;
    }

    terminalRef.current = false;
    draftIdRef.current = draft.draftId;
    plannedTestIdRef.current = draft.plannedTestId;
    createdAtRef.current = draft.createdAt;
    activeDraftRef.current = draft;
    pendingContentRef.current = null;
    pendingOwnerRef.current = null;
    setActiveDraft(draft);
    setRecoverableDraft(null);
    setRecoveryIssue(null);
    setStorageError(null);
  }, [reportStorageError]);

  const getDraftIdentity = useCallback(() => {
    const currentOwner = ownerRef.current;
    if (!currentOwner) return null;
    const now = new Date().toISOString();
    draftIdRef.current ??= generateId();
    plannedTestIdRef.current ??= generateId();
    createdAtRef.current ??= now;
    return {
      draftId: draftIdRef.current,
      plannedTestId: plannedTestIdRef.current,
      createdAt: createdAtRef.current,
    };
  }, []);

  const schedulePersist = useCallback(() => {
    if (!enabledRef.current || !ownerRef.current) return;

    // A completed/aborted draft is terminal only until the next active step is
    // entered. This lets Finish/Abort/Retest immediately establish a new one.
    terminalRef.current = false;
    const shouldWriteImmediately = !activeDraftRef.current && !pendingContentRef.current;
    getDraftIdentity();
    pendingContentRef.current = buildSnapshotRef.current();
    pendingOwnerRef.current = ownerRef.current;
    clearTimer();
    if (shouldWriteImmediately) {
      void flushRef.current();
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current();
    }, 450);
  }, [clearTimer, getDraftIdentity]);

  const commit = useCallback(async (): Promise<void> => {
    terminalRef.current = true;
    clearTimer();
    pendingContentRef.current = null;
    pendingOwnerRef.current = null;
    await writeChainRef.current.catch(() => undefined);

    const draft = activeDraftRef.current;
    const currentOwner = draft?.owner ?? ownerRef.current;
    if (draft && currentOwner) {
      try {
        await deleteActiveTestDraft(draft.draftId, currentOwner);
      } catch (error) {
        // The immutable test record is already committed; leaving a stale draft is recoverable.
        reportStorageError(errorMessage(error, 'The completed test draft could not be cleaned up.'));
      }
    }

    activeDraftRef.current = null;
    draftIdRef.current = null;
    plannedTestIdRef.current = null;
    createdAtRef.current = null;
    if (mountedRef.current) {
      setActiveDraft(null);
      setRecoverableDraft(null);
      setRecoveryIssue(null);
    }
  }, [clearTimer, reportStorageError]);

  const discard = useCallback(async (cleanupFiles = true): Promise<void> => {
    terminalRef.current = true;
    clearTimer();
    pendingContentRef.current = null;
    pendingOwnerRef.current = null;
    await writeChainRef.current.catch(() => undefined);

    const draft = activeDraftRef.current ?? recoverableDraft;
    const issue = recoveryIssue;
    const currentOwner = draft?.owner ?? ownerRef.current;
    const draftId = draft?.draftId ?? issue?.id ?? null;
    let failed = false;

    if (draftId && currentOwner) {
      try {
        await deleteActiveTestDraft(draftId, currentOwner);
      } catch (error) {
        failed = true;
        reportStorageError(errorMessage(error, 'The saved test draft could not be discarded.'));
      }
    }
    if (cleanupFiles && draftId) {
      await deleteDraftAttachmentFiles(draftId);
    }

    activeDraftRef.current = null;
    draftIdRef.current = null;
    plannedTestIdRef.current = null;
    createdAtRef.current = null;
    if (mountedRef.current) {
      setActiveDraft(null);
      setRecoverableDraft(null);
      setRecoveryIssue(null);
      if (!failed) setStorageError(null);
    }
  }, [clearTimer, recoveryIssue, recoverableDraft, reportStorageError]);

  useEffect(() => {
    mountedRef.current = true;
    activeDraftRef.current = null;
    draftIdRef.current = null;
    plannedTestIdRef.current = null;
    createdAtRef.current = null;
    pendingContentRef.current = null;
    pendingOwnerRef.current = null;
    terminalRef.current = false;
    setActiveDraft(null);
    setRecoverableDraft(null);
    setRecoveryIssue(null);
    void refreshRef.current();

    return () => {
      mountedRef.current = false;
      clearTimer();
      void flushRef.current();
    };
  }, [clearTimer, owner?.ownerKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') return;
      void flushRef.current();
    });
    return () => subscription.remove();
  }, []);

  return {
    activeDraft,
    recoverableDraft,
    recoveryIssue,
    storageError,
    refresh,
    adopt,
    schedulePersist,
    flush,
    getDraftIdentity,
    commit,
    discard,
  };
}
