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
  syncStatus: SyncStatus;
  createdAt: string;
  syncedAt: string | null;
  retryCount: number;
  photoUri: string | null;
  originalTestId: string | null;
};

type LocalDraft = {
  id: string;
  officerId: number | null;
  driverData: string;
  step: "scan" | "reading";
  createdAt: string;
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

type WebDbState = {
  tests: LocalTestRecord[];
  drafts: LocalDraft[];
  audit_events: AuditEvent[];
};

type CountRow = { count: number };

const STORAGE_KEY = "integiscan-web-db";

function loadState(): WebDbState {
  if (typeof window === "undefined") {
    return { tests: [], drafts: [], audit_events: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { tests: [], drafts: [], audit_events: [] };
    }
    const parsed = JSON.parse(raw) as Partial<WebDbState>;
    return {
      tests: Array.isArray(parsed.tests) ? parsed.tests : [],
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      audit_events: Array.isArray(parsed.audit_events) ? parsed.audit_events : [],
    };
  } catch {
    return { tests: [], drafts: [], audit_events: [] };
  }
}

function saveState(state: WebDbState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function matchesOfficer(row: { officerId: number | null }, officerId?: number | null) {
  if (officerId !== undefined) {
    if (officerId === null) return row.officerId === null;
    return row.officerId === officerId;
  }
  return true;
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

  async runAsync(sql: string, params: unknown[] = []): Promise<void> {
    const state = loadState();

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
      } satisfies LocalTestRecord;
      state.tests = state.tests.filter((item) => item.id !== record.id);
      state.tests.push(record);
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = ?, syncedAt = ?, retryCount = 0 WHERE id = ?")) {
      const [syncStatus, syncedAt, id] = params as [SyncStatus, string, string];
      state.tests = state.tests.map((item) =>
        item.id === id ? { ...item, syncStatus, syncedAt, retryCount: 0 } : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = ?, retryCount = retryCount + 1 WHERE id = ?")) {
      const [syncStatus, id] = params as [SyncStatus, string];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? { ...item, syncStatus, retryCount: item.retryCount + 1 }
          : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'failed' WHERE id = ?")) {
      const [id] = params as [string];
      state.tests = state.tests.map((item) =>
        item.id === id ? { ...item, syncStatus: "failed" } : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET retryCount = retryCount + 1, syncStatus = 'pending_sync' WHERE id = ?")) {
      const [id] = params as [string];
      state.tests = state.tests.map((item) =>
        item.id === id
          ? { ...item, syncStatus: "pending_sync", retryCount: item.retryCount + 1 }
          : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'pending_sync' WHERE syncStatus = 'failed' AND officerId = ?")) {
      const [officerId] = params as [number];
      state.tests = state.tests.map((item) =>
        item.syncStatus === "failed" && item.officerId === officerId
          ? { ...item, syncStatus: "pending_sync" }
          : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE tests SET syncStatus = 'pending_sync' WHERE syncStatus = 'failed' AND officerId IS NULL")) {
      state.tests = state.tests.map((item) =>
        item.syncStatus === "failed" && item.officerId === null
          ? { ...item, syncStatus: "pending_sync" }
          : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM tests WHERE syncStatus = 'synced' AND createdAt < ?")) {
      const [cutoffIso] = params as [string];
      state.tests = state.tests.filter(
        (item) => !(item.syncStatus === "synced" && item.createdAt < cutoffIso),
      );
      saveState(state);
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
      saveState(state);
      return;
    }

    if (sql.startsWith("UPDATE drafts SET driverData = ?, step = ? WHERE id = ?")) {
      const [driverData, step, id] = params as [string, "scan" | "reading", string];
      state.drafts = state.drafts.map((item) =>
        item.id === id ? { ...item, driverData, step } : item,
      );
      saveState(state);
      return;
    }

    if (sql.startsWith("DELETE FROM drafts WHERE id = ?")) {
      const [id] = params as [string];
      state.drafts = state.drafts.filter((item) => item.id !== id);
      saveState(state);
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
      saveState(state);
    }
  },

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const state = loadState();

    if (sql.includes("FROM tests WHERE syncStatus = 'pending_sync'")) {
      const officerId = params[0] as number | undefined;
      const rows = sortByCreatedAtAsc(
        state.tests.filter(
          (item) =>
            item.syncStatus === "pending_sync" && matchesOfficer(item, officerId ?? null),
        ),
      );
      return rows as T[];
    }

    if (sql.includes("FROM tests WHERE syncStatus = 'failed'")) {
      const officerId = params[0] as number | undefined;
      const rows = sortByCreatedAtAsc(
        state.tests.filter(
          (item) =>
            item.syncStatus === "failed" && matchesOfficer(item, officerId ?? null),
        ),
      );
      return rows as T[];
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

    if (sql.includes("FROM audit_events ORDER BY occurredAt DESC LIMIT ?")) {
      const [limit] = params as [number];
      return [...state.audit_events]
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, limit) as T[];
    }

    if (sql.includes("FROM audit_events WHERE action LIKE ? ORDER BY occurredAt DESC LIMIT ?")) {
      const [prefix, limit] = params as [string, number];
      const startsWith = prefix.replace("%", "");
      return [...state.audit_events]
        .filter((item) => item.action.startsWith(startsWith))
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .slice(0, limit) as T[];
    }

    return [];
  },

  async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const state = loadState();

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'synced'")) {
      const officerId = params[0] as number | undefined;
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "synced" &&
          (sql.includes("officerId = ?")
            ? item.officerId === officerId
            : item.officerId === null),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'pending_sync'")) {
      const officerId = params[0] as number | undefined;
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "pending_sync" &&
          (sql.includes("officerId = ?")
            ? item.officerId === officerId
            : item.officerId === null),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE syncStatus = 'failed'")) {
      const officerId = params[0] as number | undefined;
      const count = state.tests.filter(
        (item) =>
          item.syncStatus === "failed" &&
          (sql.includes("officerId = ?")
            ? item.officerId === officerId
            : item.officerId === null),
      ).length;
      return { count } as T;
    }

    if (sql.includes("SELECT COUNT(*) as count FROM tests WHERE createdAt >=")) {
      const [startIso, endIso, officerId] = params as [string, string, number | undefined];
      const count = state.tests.filter((item) => {
        const inRange = item.createdAt >= startIso && item.createdAt < endIso;
        if (!inRange) return false;
        if (sql.includes("officerId = ?")) return item.officerId === officerId;
        return item.officerId === null;
      }).length;
      return { count } as T;
    }

    if (sql.includes("SELECT * FROM tests WHERE id = ?")) {
      const [id] = params as [string];
      return (state.tests.find((item) => item.id === id) ?? null) as T | null;
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

    return null;
  },
};

export async function getDB() {
  return webDb;
}

export async function closeDB(): Promise<void> {}
