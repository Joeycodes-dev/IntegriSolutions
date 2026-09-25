type SyncStatus = "pending_sync" | "synced" | "failed";

type LocalTestRecord = {
  id: string;
  officerId: number | null;
  officerName: string;
  badgeNumber: string;
  driverName: string;
  driverId: string;
  driverDob: string;
  bacReading: number;
  result: string;
  location: string;
  hash: string;
  receiptNumber?: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  syncedAt: string | null;
  retryCount: number;
  lastAttemptAt?: string | null;
  lastError?: string | null;
  photoUri: string | null;
  originalTestId: string | null;
  deviceTransport?: string | null;
  deviceSerial?: string | null;
  deviceCalibrationVersion?: string | null;
  deviceCalibrationR0?: number | null;
  deviceSessionPeakRaw?: number | null;
  deviceAvgRaw?: number | null;
  deviceRaw?: number | null;
  deviceCapturedAt?: string | null;
};

type LocalDraft = {
  id: string;
  officerId: number | null;
  ownerKey?: string | null;
  driverData: string;
  step: "scan" | "reading";
  payloadVersion?: number;
  status?: "active" | "discarded" | "committed";
  createdAt: string;
  updatedAt?: string | null;
};

type AuditEvent = {
  id: string;
  occurredAt: string;
  officerId: number | null;
  officerName: string | null;
  badgeNumber: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  outcome: string;
  severity: string;
  message: string;
  metadata: string | null;
};

type LocalEvidenceAttachment = {
  id: string;
  testId: string;
  category: string;
  uri: string;
  idempotencyKey?: string | null;
  contentHash?: string | null;
  syncStatus: SyncStatus;
  retryCount: number;
  createdAt: string;
  syncedAt: string | null;
  lastAttemptAt?: string | null;
  lastError?: string | null;
};

type CachedAlertRecord = {
  id: string;
  officerId: number | null;
  version: number;
  alertJson: string;
  receivedAt: string;
  acknowledgedAt: string | null;
  updatedAt: string;
};

type PendingAlertAck = {
  alertId: string;
  officerId: number | null;
  requestedAt: string;
  retryCount: number;
};

type WebDbState = {
  tests: LocalTestRecord[];
  drafts: LocalDraft[];
  audit_events: AuditEvent[];
  evidence_attachments: LocalEvidenceAttachment[];
  alert_cache: CachedAlertRecord[];
  alert_ack_queue: PendingAlertAck[];
};

type CountRow = { count: number };

const STORAGE_KEY = "integiscan-web-db";

function loadState(): WebDbState {
  if (typeof window === "undefined") {
    return { tests: [], drafts: [], audit_events: [], evidence_attachments: [], alert_cache: [], alert_ack_queue: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { tests: [], drafts: [], audit_events: [], evidence_attachments: [], alert_cache: [], alert_ack_queue: [] };
    }
    const parsed = JSON.parse(raw) as Partial<WebDbState>;
    return {
      tests: Array.isArray(parsed.tests) ? parsed.tests : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      audit_events: Array.isArray(parsed.audit_events) ? parsed.audit_events : [],
      evidence_attachments: Array.isArray(parsed.evidence_attachments) ? parsed.evidence_attachments : [],
      alert_cache: Array.isArray(parsed.alert_cache) ? parsed.alert_cache : [],
      alert_ack_queue: Array.isArray(parsed.alert_ack_queue) ? parsed.alert_ack_queue : [],
    };
  } catch {
    return { tests: [], drafts: [], audit_events: [], evidence_attachments: [], alert_cache: [], alert_ack_queue: [] };
  }
}

function saveState(state: WebDbState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let transactionState: WebDbState | null = null;
let transactionTail: Promise<void> = Promise.resolve();

function cloneState(state: WebDbState): WebDbState {
  return {
    tests: [...state.tests],
    drafts: [...state.drafts],
    audit_events: [...state.audit_events],
    evidence_attachments: [...state.evidence_attachments],
    alert_cache: [...state.alert_cache],
    alert_ack_queue: [...state.alert_ack_queue],
  };
}

function persistRunState(state: WebDbState): void {
  if (!transactionState) saveState(state);
}

function matchesOfficer(row: { officerId: number | null }, officerId?: number | null) {
  if (officerId !== undefined) {
    if (officerId === null) return row.officerId === null;
    return row.officerId === officerId;
  }
  return true;
}

function matchesScopedOfficer(row: { officerId: number | null }, officerId: number | undefined, includeUnscoped: boolean) {
  if (officerId === undefined) return row.officerId === null;
  return row.officerId === officerId || (includeUnscoped && row.officerId === null);
}

function sortByCreatedAtDesc<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function sortByCreatedAtAsc<T extends { createdAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const webDb = {
  async execAsync(_sql: string): Promise<void> {},

  async closeAsync(): Promise<void> {},

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    // The web shim has no SQLite lock. Serialize transactions so two async
    // callers cannot overwrite one another's working state in localStorage.
    const run = transactionTail.then(async () => {
      const workingState = cloneState(loadState());
      transactionState = workingState;
      try {
        await task();
        saveState(workingState);
      } finally {
        transactionState = null;
      }
    });
    transactionTail = run.catch(() => undefined);
    return run;
  },

  async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const state = transactionState ?? loadState();

    if (sql.startsWith("INSERT INTO tests")) {
      const record = {
        id: params[0] as string,
        officerId: (params[1] as number | null) ?? null,
        officerName: params[2] as string,
        badgeNumber: params[3] as string,
        driverName: params[4] as string,
        driverId: params[5] as string,
        driverDob: params[6] as string,
        bacReading: Number(params[7]),
        result: params[8] as string,
        location: params[9] as string,
        hash: params[10] as string,
        syncStatus: params[11] as SyncStatus,
        createdAt: params[12] as string,
        syncedAt: (params[13] as string | null) ?? null,
        retryCount: Number(params[14] ?? 0),
        photoUri: (params[15] as string | null) ?? null,
        originalTestId: (params[16] as string | null) ?? null,
        deviceTransport: (params[17] as string | null) ?? null,
        deviceSerial: (params[18] as string | null) ?? null,
        deviceCalibrationVersion: (params[19] as string | null) ?? null,
        deviceCalibrationR0: (params[20] as number | null) ?? null,
        deviceSessionPeakRaw: (params[21] as number | null) ?? null,
        deviceAvgRaw: (params[22] as number | null) ?? null,
        deviceRaw: (params[23] as number | null) ?? null,
        deviceCapturedAt: (params[24] as string | null) ?? null,
        receiptNumber: (params[25] as string | null) ?? null,
      } satisfies LocalTestRecord;
      const existing = state.tests.find((item) => item.id === record.id);
      if (existing) {
        const receiptConflict = Boolean(
          existing.receiptNumber &&
          record.receiptNumber &&
          existing.receiptNumber !== record.receiptNumber
        );
        if (existing.hash !== record.hash || existing.officerId !== record.officerId || receiptConflict) {
          throw new Error("A different test already uses this planned test ID.");
        }
        return;
      }
      state.tests = state.tests.filter((item) => item.id !== record.id);
      state.tests.push(record);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = ?, syncedAt = ?, retryCount = 0 WHERE id = ?")) {
      const [syncStatus, syncedAt, id] = params as [SyncStatus, string, string];
      state.tests = state.tests.map((item) =>
        item.id === id ? { ...item, syncStatus, syncedAt, retryCount: 0 } : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?")) {
      const [syncStatus, id] = params as [SyncStatus, string];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? { ...item, syncStatus, retryCount: item.retryCount + 1 }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'synced', syncedAt = ?, retryCount = 0, lastError = NULL, lastAttemptAt = ? WHERE id = ?")) {
      const [syncedAt, lastAttemptAt, id] = params as [string, string, string];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? { ...item, syncStatus: "synced", syncedAt, retryCount: 0, lastError: null, lastAttemptAt }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = ?, retryCount = retryCount + ?, lastError = ?, lastAttemptAt = ? WHERE id = ?")) {
      const [syncStatus, retryIncrement, lastError, lastAttemptAt, id] = params as [
        SyncStatus,
        number,
        string,
        string,
        string,
      ];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? {
              ...item,
              syncStatus,
              retryCount: item.retryCount + retryIncrement,
              lastError,
              lastAttemptAt,
            }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (normalizedSql.startsWith("UPDATE tests SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL WHERE id = ? AND syncStatus = 'failed'")) {
      const [id, scopedOfficerId] = params as [string, number | null | undefined];
      state.tests = state.tests.map((item) =>
        item.id === id &&
        item.syncStatus === "failed" &&
        (scopedOfficerId === undefined ||
          item.officerId === scopedOfficerId ||
          item.officerId === null)
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL WHERE id = ? AND syncStatus = 'failed'")) {
      const [id] = params as [string];
      state.tests = state.tests.map((item) =>
        item.id === id && item.syncStatus === "failed"
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'failed' WHERE id = ?")) {
      const [id] = params as [string];
      state.tests = state.tests.map((item) =>
        item.id === id ? { ...item, syncStatus: "failed" } : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET retryCount = retryCount + 1, syncStatus = 'pending_sync' WHERE id = ?")) {
      const [id] = params as [string];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? { ...item, syncStatus: "pending_sync", retryCount: item.retryCount + 1 }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL WHERE syncStatus = 'failed' AND (officerId = ? OR officerId IS NULL)")) {
      const [officerId] = params as [number];
      state.tests = state.tests.map((item) =>
        item.syncStatus === "failed" && (item.officerId === officerId || item.officerId === null)
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL WHERE syncStatus = 'failed' AND officerId IS NULL")) {
      state.tests = state.tests.map((item) =>
        item.syncStatus === "failed" && item.officerId === null
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM tests WHERE syncStatus = 'synced' AND createdAt < ?")) {
      const [cutoffIso] = params as [string];
      state.tests = state.tests.filter(
        (item) => !(item.syncStatus === "synced" && item.createdAt < cutoffIso),
      );
      persistRunState(state);
      return;
    }

    if (normalizedSql.startsWith("DELETE FROM drafts") && normalizedSql.includes("ownerKey = ? AND status = 'active' AND id <> ?")) {
      const [ownerKey, id] = params as [string, string];
      state.drafts = state.drafts.filter(
        (item) => !(item.ownerKey === ownerKey && (item.status ?? "active") === "active" && item.id !== id),
      );
      persistRunState(state);
      return;
    }

    if (normalizedSql.startsWith("INSERT INTO drafts (") && normalizedSql.includes("ownerKey")) {
      const [id, officerId, ownerKey, driverData, step, payloadVersion, createdAt, updatedAt] = params as [
        string,
        number | null,
        string,
        string,
        "scan" | "reading",
        number,
        string,
        string,
      ];
      const existing = state.drafts.find((item) => item.id === id);
      if (!existing || existing.ownerKey === ownerKey) {
        const draft: LocalDraft = {
          id,
          officerId,
          ownerKey,
          driverData,
          step,
          payloadVersion,
          status: "active",
          createdAt: existing?.createdAt ?? createdAt,
          updatedAt,
        };
        state.drafts = state.drafts.filter((item) => item.id !== id);
        state.drafts.push(draft);
        persistRunState(state);
      }
      return;
    }

    if (normalizedSql.startsWith("DELETE FROM drafts WHERE id = ? AND ownerKey = ?")) {
      const [id, ownerKey] = params as [string, string];
      state.drafts = state.drafts.filter(
        (item) => !(item.id === id && item.ownerKey === ownerKey),
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("INSERT INTO drafts")) {
      const draft = {
        id: params[0] as string,
        officerId: (params[1] as number | null) ?? null,
        driverData: params[2] as string,
        step: params[3] as "scan" | "reading",
        createdAt: params[4] as string,
      } satisfies LocalDraft;
      state.drafts = state.drafts.filter((item) => item.id !== draft.id);
      state.drafts.push(draft);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE drafts SET driverData = ?, step = ? WHERE id = ?")) {
      const [driverData, step, id] = params as [string, "scan" | "reading", string];
      state.drafts = state.drafts.map((item) =>
        item.id === id ? { ...item, driverData, step } : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM drafts WHERE id = ?")) {
      const [id] = params as [string];
      state.drafts = state.drafts.filter((item) => item.id !== id);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("INSERT INTO audit_events")) {
      const event = {
        id: params[0] as string,
        occurredAt: params[1] as string,
        officerId: (params[2] as number | null) ?? null,
        officerName: (params[3] as string | null) ?? null,
        badgeNumber: (params[4] as string | null) ?? null,
        action: params[5] as string,
        entityType: (params[6] as string | null) ?? null,
        entityId: (params[7] as string | null) ?? null,
        outcome: params[8] as string,
        severity: params[9] as string,
        message: params[10] as string,
        metadata: (params[11] as string | null) ?? null,
      } satisfies AuditEvent;
      state.audit_events.unshift(event);
      persistRunState(state);
    }

    if (sql.startsWith("INSERT INTO evidence_attachments")) {
      const attachment = {
        id: params[0] as string,
        testId: params[1] as string,
        category: params[2] as string,
        uri: params[3] as string,
        syncStatus: params[4] as SyncStatus,
        retryCount: Number(params[5] ?? 0),
        createdAt: params[6] as string,
        syncedAt: (params[7] as string | null) ?? null,
        idempotencyKey: (params[8] as string | null) ?? null,
        contentHash: (params[9] as string | null) ?? null,
      } satisfies LocalEvidenceAttachment;
      const existing = state.evidence_attachments.find((item) => item.id === attachment.id);
      if (existing) {
        const keyConflict = Boolean(
          existing.idempotencyKey &&
          attachment.idempotencyKey &&
          existing.idempotencyKey !== attachment.idempotencyKey
        );
        const hashConflict = Boolean(
          existing.contentHash &&
          attachment.contentHash &&
          existing.contentHash !== attachment.contentHash
        );
        if (
          existing.testId !== attachment.testId ||
          existing.category !== attachment.category ||
          existing.uri !== attachment.uri ||
          keyConflict ||
          hashConflict
        ) {
          throw new Error("A different evidence item already uses this attachment ID.");
        }
        return;
      }
      state.evidence_attachments = state.evidence_attachments.filter((item) => item.id !== attachment.id);
      state.evidence_attachments.push(attachment);
      persistRunState(state);
      return;
    }

    if (normalizedSql.startsWith("UPDATE evidence_attachments SET idempotencyKey = ?, contentHash = ? WHERE id = ?")) {
      const [idempotencyKey, contentHash, id, expectedKey, expectedHash] = params as [string, string, string, string, string];
      state.evidence_attachments = state.evidence_attachments.map((item) => {
        if (item.id !== id) return item;
        const keyMatches = item.idempotencyKey == null || item.idempotencyKey === idempotencyKey || item.idempotencyKey === expectedKey;
        const hashMatches = item.contentHash == null || item.contentHash === contentHash || item.contentHash === expectedHash;
        return keyMatches && hashMatches ? { ...item, idempotencyKey, contentHash } : item;
      });
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE evidence_attachments SET syncStatus = ?, syncedAt = ?, retryCount = 0 WHERE id = ?")) {
      const [syncStatus, syncedAt, id] = params as [SyncStatus, string, string];
      state.evidence_attachments = state.evidence_attachments.map((item) =>
        item.id === id ? { ...item, syncStatus, syncedAt, retryCount: 0 } : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE evidence_attachments SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?")) {
      const [syncStatus, id] = params as [SyncStatus, string];
      state.evidence_attachments = state.evidence_attachments.map((item) =>
        item.id === id
          ? { ...item, syncStatus, retryCount: item.retryCount + 1 }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE evidence_attachments SET syncStatus = 'synced', syncedAt = ?, retryCount = 0, lastError = NULL, lastAttemptAt = ? WHERE id = ?")) {
      const [syncedAt, lastAttemptAt, id] = params as [string, string, string];
      state.evidence_attachments = state.evidence_attachments.map((item) =>
        item.id === id
          ? { ...item, syncStatus: "synced", syncedAt, retryCount: 0, lastError: null, lastAttemptAt }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE evidence_attachments SET syncStatus = ?, retryCount = retryCount + ?, lastError = ?, lastAttemptAt = ? WHERE id = ?")) {
      const [syncStatus, retryIncrement, lastError, lastAttemptAt, id] = params as [
        SyncStatus,
        number,
        string,
        string,
        string,
      ];
      state.evidence_attachments = state.evidence_attachments.map((item) =>
        item.id === id
          ? {
              ...item,
              syncStatus,
              retryCount: item.retryCount + retryIncrement,
              lastError,
              lastAttemptAt,
            }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (
      sql.includes("UPDATE evidence_attachments SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL") &&
      sql.includes("WHERE id = ?")
    ) {
      const [id, scopedOfficerId] = params as [string, number | null | undefined];
      const parent = state.tests.find((test) => test.id === state.evidence_attachments.find((item) => item.id === id)?.testId);
      const parentMatches = scopedOfficerId === undefined ||
        parent?.officerId === scopedOfficerId ||
        parent?.officerId === null;
      state.evidence_attachments = state.evidence_attachments.map((item) =>
        item.id === id && item.syncStatus === "failed" && parent?.syncStatus === "synced" && parentMatches
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.includes("UPDATE evidence_attachments SET syncStatus = 'pending_sync', retryCount = 0, lastError = NULL") && sql.includes("syncStatus = 'failed'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("(t.officerId = ? OR t.officerId IS NULL)");
      const requiresSyncedParent = sql.includes("AND t.syncStatus = 'synced'");
      state.evidence_attachments = state.evidence_attachments.map((item) => {
        const parent = state.tests.find((test) => test.id === item.testId);
        return item.syncStatus === "failed" &&
          (!requiresSyncedParent || parent?.syncStatus === "synced") &&
          (parent ? matchesScopedOfficer(parent, officerId, includeUnscoped) : false)
          ? { ...item, syncStatus: "pending_sync", retryCount: 0, lastError: null }
          : item;
      });
      persistRunState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM evidence_attachments WHERE id = ?")) {
      const [id] = params as [string];
      state.evidence_attachments = state.evidence_attachments.filter((item) => item.id !== id);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE alert_cache SET officerId = ?")) {
      const [officerId, version, alertJson, receivedAt, acknowledgedAt, updatedAt, id] = params as [
        number | null,
        number,
        string,
        string,
        string | null,
        string,
        string,
      ];
      state.alert_cache = state.alert_cache.map((item) =>
        item.id === id
          ? { ...item, officerId: officerId ?? null, version, alertJson, receivedAt, acknowledgedAt: acknowledgedAt ?? null, updatedAt }
          : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("INSERT INTO alert_cache")) {
      const [id, officerId, version, alertJson, receivedAt, acknowledgedAt, updatedAt] = params as [
        string,
        number | null,
        number,
        string,
        string,
        string | null,
        string,
      ];
      const record: CachedAlertRecord = {
        id,
        officerId: officerId ?? null,
        version,
        alertJson,
        receivedAt,
        acknowledgedAt: acknowledgedAt ?? null,
        updatedAt,
      };
      state.alert_cache = state.alert_cache.filter((item) => item.id !== record.id);
      state.alert_cache.push(record);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE alert_cache SET acknowledgedAt = ? WHERE id = ?")) {
      const [acknowledgedAt, id] = params as [string, string];
      state.alert_cache = state.alert_cache.map((item) =>
        item.id === id ? { ...item, acknowledgedAt } : item,
      );
      persistRunState(state);
      return;
    }

    if (sql.startsWith("INSERT INTO alert_ack_queue")) {
      const [alertId, officerId, requestedAt] = params as [string, number | null, string];
      const record: PendingAlertAck = { alertId, officerId: officerId ?? null, requestedAt, retryCount: 0 };
      state.alert_ack_queue = state.alert_ack_queue.filter((item) => item.alertId !== record.alertId);
      state.alert_ack_queue.push(record);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM alert_ack_queue WHERE alertId = ?")) {
      const [alertId] = params as [string];
      state.alert_ack_queue = state.alert_ack_queue.filter((item) => item.alertId !== alertId);
      persistRunState(state);
      return;
    }

    if (sql.startsWith("UPDATE alert_ack_queue SET retryCount = retryCount + 1 WHERE alertId = ?")) {
      const [alertId] = params as [string];
      state.alert_ack_queue = state.alert_ack_queue.map((item) =>
        item.alertId === alertId ? { ...item, retryCount: item.retryCount + 1 } : item,
      );
      persistRunState(state);
      return;
    }
  },

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const state = transactionState ?? loadState();

    if (sql.includes("FROM tests WHERE syncStatus = 'pending_sync'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const rows = sortByCreatedAtAsc(
        state.tests.filter(
          (item) =>
            item.syncStatus === "pending_sync" && matchesScopedOfficer(item, officerId, includeUnscoped),
        ),
      );
      return rows as T[];
    }

    if (sql.includes("FROM tests WHERE syncStatus = 'failed'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const rows = sortByCreatedAtAsc(
        state.tests.filter(
          (item) =>
            item.syncStatus === "failed" && matchesScopedOfficer(item, officerId, includeUnscoped),
        ),
      );
      return rows as T[];
    }

    if (sql.includes("FROM tests WHERE officerId = ? OR officerId IS NULL ORDER BY createdAt DESC LIMIT")) {
      const [officerId] = params as [number];
      const limitMatch = sql.match(/LIMIT (\d+)/);
      const limit = Number(limitMatch?.[1] ?? 3);
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === officerId || item.officerId === null),
      ).slice(0, limit) as T[];
    }

    if (sql.includes("FROM tests WHERE officerId = ? OR officerId IS NULL ORDER BY createdAt DESC")) {
      const [officerId] = params as [number];
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === officerId || item.officerId === null),
      ) as T[];
    }

    if (sql.includes("FROM tests WHERE officerId = ? ORDER BY createdAt DESC")) {
      const [officerId] = params as [number];
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === officerId),
      ) as T[];
    }

    if (sql.includes("FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC")) {
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === null),
      ) as T[];
    }

    if (sql.includes("FROM tests WHERE officerId = ? ORDER BY createdAt DESC LIMIT")) {
      const [officerId] = params as [number];
      const limitMatch = sql.match(/LIMIT (\d+)/);
      const limit = Number(limitMatch?.[1] ?? 3);
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === officerId),
      ).slice(0, limit) as T[];
    }

    if (sql.includes("FROM tests WHERE officerId IS NULL ORDER BY createdAt DESC LIMIT")) {
      const limitMatch = sql.match(/LIMIT (\d+)/);
      const limit = Number(limitMatch?.[1] ?? 3);
      return sortByCreatedAtDesc(
        state.tests.filter((item) => item.officerId === null),
      ).slice(0, limit) as T[];
    }

    if (sql.includes("FROM audit_events ORDER BY occurredAt DESC LIMIT")) {
      const limit = Number(sql.match(/LIMIT (\d+)/)?.[1] ?? 500);
      return [...state.audit_events]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, limit) as T[];
    }

    if (sql.includes("FROM audit_events WHERE action LIKE ? ORDER BY occurredAt DESC LIMIT")) {
      const [prefix] = params as [string];
      const limit = Number(sql.match(/LIMIT (\d+)/)?.[1] ?? 500);
      const startsWith = prefix.replace("%", "");
      return [...state.audit_events]
        .filter((item) => item.action.startsWith(startsWith))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, limit) as T[];
    }

    if (sql.includes("SELECT a.*, t.syncStatus AS parentSyncStatus")) {
      const officerId = params[0] as number | undefined;
      const rows = state.evidence_attachments
        .filter((item) => {
          if (item.syncStatus !== "pending_sync" && item.syncStatus !== "failed") return false;
          const parent = state.tests.find((test) => test.id === item.testId);
          return parent ? matchesScopedOfficer(parent, officerId, true) : false;
        })
        .sort((a, b) => {
          const statusOrder = Number(a.syncStatus !== "failed") - Number(b.syncStatus !== "failed");
          return statusOrder || a.createdAt.localeCompare(b.createdAt);
        })
        .map((item) => {
          const parent = state.tests.find((test) => test.id === item.testId);
          return {
            ...item,
            parentSyncStatus: parent?.syncStatus ?? "failed",
            parentCreatedAt: parent?.createdAt ?? item.createdAt,
          };
        });
      return rows as T[];
    }

    if (sql.includes("SELECT a.* FROM evidence_attachments a") && sql.includes("a.syncStatus = 'pending_sync'")) {
      const officerId = params[0] as number | undefined;
      const rows = sortByCreatedAtAsc(
        state.evidence_attachments.filter((item) => {
          if (item.syncStatus !== "pending_sync") return false;
          const parent = state.tests.find((test) => test.id === item.testId);
          return parent ? matchesScopedOfficer(parent, officerId, true) : false;
        }),
      );
      return rows as T[];
    }

    if (sql.includes("FROM evidence_attachments WHERE testId = ? ORDER BY createdAt ASC")) {
      const [testId] = params as [string];
      return state.evidence_attachments
        .filter((item) => item.testId === testId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) as T[];
    }

    if (sql.includes("FROM evidence_attachments WHERE syncStatus = 'pending_sync'")) {
      return state.evidence_attachments
        .filter((item) => item.syncStatus === "pending_sync")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) as T[];
    }

    if (sql.includes("FROM evidence_attachments WHERE syncStatus = 'failed'")) {
      return state.evidence_attachments
        .filter((item) => item.syncStatus === "failed")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) as T[];
    }

    if (sql.includes("FROM alert_cache WHERE officerId = ? OR officerId IS NULL ORDER BY updatedAt DESC")) {
      const [officerId] = params as [number];
      return [...state.alert_cache]
        .filter((item) => item.officerId === officerId || item.officerId === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as T[];
    }

    if (sql.includes("FROM alert_cache WHERE officerId IS NULL ORDER BY updatedAt DESC")) {
      return [...state.alert_cache]
        .filter((item) => item.officerId === null)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as T[];
    }

    if (sql.includes("FROM alert_ack_queue WHERE officerId = ? OR officerId IS NULL ORDER BY requestedAt ASC")) {
      const [officerId] = params as [number];
      return [...state.alert_ack_queue]
        .filter((item) => item.officerId === officerId || item.officerId === null)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)) as T[];
    }

    if (sql.includes("FROM alert_ack_queue WHERE officerId IS NULL ORDER BY requestedAt ASC")) {
      return [...state.alert_ack_queue]
        .filter((item) => item.officerId === null)
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)) as T[];
    }

    if (sql.includes("FROM alert_ack_queue ORDER BY requestedAt ASC")) {
      return [...state.alert_ack_queue].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)) as T[];
    }

    return [];
  },

  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    const state = transactionState ?? loadState();

    if (sql.includes("FROM evidence_attachments a") && sql.includes("SUM(CASE WHEN a.syncStatus")) {
      const officerId = params[0] as number | undefined;
      const scoped = state.evidence_attachments.filter((item) => {
        const parent = state.tests.find((test) => test.id === item.testId);
        return parent ? matchesScopedOfficer(parent, officerId, true) : false;
      });
      return {
        synced: scoped.filter((item) => item.syncStatus === "synced").length,
        pending: scoped.filter((item) => item.syncStatus === "pending_sync").length,
        failed: scoped.filter((item) => item.syncStatus === "failed").length,
      } as T;
    }

    if (sql.includes("SELECT MAX(syncedAt) as syncedAt FROM")) {
      const officerId = params[0] as number | undefined;
      const recordValues = state.tests
        .filter((item) => item.syncStatus === "synced" && matchesScopedOfficer(item, officerId, true))
        .map((item) => item.syncedAt);
      const evidenceValues = state.evidence_attachments
        .filter((item) => item.syncStatus === "synced")
        .map((item) => {
          const parent = state.tests.find((test) => test.id === item.testId);
          return parent && matchesScopedOfficer(parent, officerId, true) ? item.syncedAt : null;
        });
      const values = [...recordValues, ...evidenceValues]
        .filter((value): value is string => Boolean(value))
        .sort()
        .reverse();
      return { syncedAt: values[0] ?? null } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM alert_ack_queue")) {
      const officerId = params[0] as number | undefined;
      const count = state.alert_ack_queue.filter((item) =>
        matchesScopedOfficer(item, officerId, true),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "synced" &&
          matchesScopedOfficer(item, officerId, includeUnscoped),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "pending_sync" &&
          matchesScopedOfficer(item, officerId, includeUnscoped),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed'")) {
      const officerId = params[0] as number | undefined;
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "failed" &&
          matchesScopedOfficer(item, officerId, includeUnscoped),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE createdAt >=")) {
      const [startIso, endIso, officerId] = params as [string, string, number | undefined];
      const includeUnscoped = sql.includes("OR officerId IS NULL");
      const count = state.tests.filter((item) => {
        const inRange = item.createdAt >= startIso && item.createdAt < endIso;
        if (!inRange) return false;
        return matchesScopedOfficer(item, officerId, includeUnscoped);
      }).length;
      return { count } as T;
    }

    if (normalizedSql.includes("SELECT hash, officerId, receiptNumber FROM tests WHERE id = ?")) {
      const [id] = params as [string];
      const item = state.tests.find((test) => test.id === id);
      return item
        ? ({ hash: item.hash, officerId: item.officerId, receiptNumber: item.receiptNumber ?? null } as T)
        : null;
    }

    if (normalizedSql.includes("SELECT hash, officerId FROM tests WHERE id = ?")) {
      const [id] = params as [string];
      const item = state.tests.find((test) => test.id === id);
      return item ? ({ hash: item.hash, officerId: item.officerId } as T) : null;
    }

    if (normalizedSql.includes("SELECT testId, category, uri, idempotencyKey, contentHash FROM evidence_attachments WHERE id = ?")) {
      const [id] = params as [string];
      const item = state.evidence_attachments.find((attachment) => attachment.id === id);
      return item
        ? ({
            testId: item.testId,
            category: item.category,
            uri: item.uri,
            idempotencyKey: item.idempotencyKey ?? null,
            contentHash: item.contentHash ?? null,
          } as T)
        : null;
    }

    if (normalizedSql.includes("SELECT ownerKey FROM drafts WHERE id = ?")) {
      const [id] = params as [string];
      const item = state.drafts.find((draft) => draft.id === id);
      return item ? ({ ownerKey: item.ownerKey ?? "" } as T) : null;
    }

    if (sql.includes("SELECT * FROM tests WHERE id = ?")) {
      const [id] = params as [string];
      return (state.tests.find((item) => item.id === id) ?? null) as T | null;
    }

    if (sql.includes("FROM drafts") && sql.includes("ownerKey = ?") && sql.includes("payloadVersion > 0")) {
      const [ownerKey] = params as [string];
      const drafts = state.drafts
        .filter(
          (item) =>
            item.ownerKey === ownerKey &&
            (item.status ?? "active") === "active" &&
            (item.payloadVersion ?? 0) > 0,
        )
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
      const item = drafts[0];
      return item
        ? ({
            ...item,
            ownerKey: item.ownerKey ?? "",
            payloadVersion: item.payloadVersion ?? 0,
            status: item.status ?? "active",
            updatedAt: item.updatedAt ?? item.createdAt,
          } as T)
        : null;
    }

    if (sql.includes("SELECT * FROM drafts WHERE id = ?")) {
      const [id] = params as [string];
      return (state.drafts.find((item) => item.id === id) ?? null) as T | null;
    }

    if (sql.includes("SELECT * FROM drafts ORDER BY createdAt DESC LIMIT 1")) {
      const [latest] = sortByCreatedAtDesc(state.drafts);
      return (latest ?? null) as T | null;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM audit_events")) {
      const row: CountRow = { count: state.audit_events.length };
      if (sql.includes("action LIKE 'auth.%'")) {
        row.count = state.audit_events.filter((item) => item.action.startsWith("auth.")).length;
      } else if (sql.includes("action LIKE 'test.%'")) {
        row.count = state.audit_events.filter((item) => item.action.startsWith("test.")).length;
      } else if (sql.includes("action LIKE 'sync.%'")) {
        row.count = state.audit_events.filter((item) => item.action.startsWith("sync.")).length;
      } else if (sql.includes("outcome = 'failure'")) {
        row.count = state.audit_events.filter((item) => item.outcome === "failure").length;
      }
      return row as T;
    }

    if (sql.includes("SELECT * FROM alert_cache WHERE id = ?")) {
      const [id] = params as [string];
      return (state.alert_cache.find((item) => item.id === id) ?? null) as T | null;
    }

    if (sql.includes("SELECT * FROM alert_ack_queue WHERE alertId = ?")) {
      const [alertId] = params as [string];
      return (state.alert_ack_queue.find((item) => item.alertId === alertId) ?? null) as T | null;
    }

    return null;
  },
};

export async function getDB() {
  return webDb;
}

export async function closeDB(): Promise<void> {}
