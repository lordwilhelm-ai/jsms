import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// Shared offline-outbox database for every module that needs to keep working
// with no internet (Books, Uniforms, Fees, Income & Expenditure). This is a
// generalization of the pattern already proven out in lib/kiosk/db.ts — one
// `pending` outbox queue (a write that couldn't reach the server yet) and one
// `cache` store (a local mirror of "current state" each module renders from
// while offline), instead of writing a bespoke IndexedDB layer per module.
const DB_NAME = "jvst-offline-db";
const DB_VERSION = 1;

export type SyncStatus = "pending" | "syncing" | "failed";

export interface PendingAction {
  offline_id: string;
  module: string;
  action: string;
  endpoint: string;
  payload: Record<string, any>;
  sync_status: SyncStatus;
  attempt_count: number;
  last_error?: string | null;
  created_at: string;
}

export interface CacheEntry {
  cache_key: string;
  module: string;
  key: string;
  value: any;
  updated_at: string;
}

interface OfflineDBSchema extends DBSchema {
  pending: {
    key: string;
    value: PendingAction;
    indexes: {
      "by-sync-status": SyncStatus;
      "by-module": string;
    };
  };

  cache: {
    key: string;
    value: CacheEntry;
    indexes: {
      "by-module": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDBSchema>> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("Offline database only works in the browser");
  }

  if (!dbPromise) {
    dbPromise = openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pending")) {
          const store = db.createObjectStore("pending", { keyPath: "offline_id" });
          store.createIndex("by-sync-status", "sync_status");
          store.createIndex("by-module", "module");
        }

        if (!db.objectStoreNames.contains("cache")) {
          const store = db.createObjectStore("cache", { keyPath: "cache_key" });
          store.createIndex("by-module", "module");
        }
      },
    });
  }

  return dbPromise;
}

function cacheKey(module: string, key: string) {
  return `${module}::${key}`;
}

// =========================
// PENDING OFFLINE QUEUE
// =========================

export async function getAllPending() {
  const db = await getDb();
  return db.getAll("pending");
}

export async function getPendingByModule(module: string) {
  const db = await getDb();
  return db.getAllFromIndex("pending", "by-module", module);
}

export async function getPendingByStatus(status: SyncStatus) {
  const db = await getDb();
  return db.getAllFromIndex("pending", "by-sync-status", status);
}

export async function queuePending(action: PendingAction) {
  const db = await getDb();
  await db.put("pending", {
    ...action,
    created_at: action.created_at ?? new Date().toISOString(),
  });
}

export async function updatePendingStatus(
  offlineId: string,
  status: SyncStatus,
  lastError?: string | null
) {
  const db = await getDb();
  const record = await db.get("pending", offlineId);
  if (!record) return;

  record.sync_status = status;
  if (status === "failed") {
    record.attempt_count = (record.attempt_count || 0) + 1;
    record.last_error = lastError || record.last_error || null;
  }

  await db.put("pending", record);
}

export async function removePending(offlineId: string) {
  const db = await getDb();
  await db.delete("pending", offlineId);
}

export async function clearPendingForModule(module: string) {
  const db = await getDb();
  const rows = await db.getAllFromIndex("pending", "by-module", module);
  const tx = db.transaction("pending", "readwrite");
  for (const row of rows) {
    await tx.store.delete(row.offline_id);
  }
  await tx.done;
}

// =========================
// LOCAL CACHE (current-state mirror)
// =========================

export async function getCacheEntry<T = any>(module: string, key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.get("cache", cacheKey(module, key));
  return row ? (row.value as T) : null;
}

export async function setCacheEntry(module: string, key: string, value: any) {
  const db = await getDb();
  await db.put("cache", {
    cache_key: cacheKey(module, key),
    module,
    key,
    value,
    updated_at: new Date().toISOString(),
  });
}

export async function getAllCacheForModule(module: string) {
  const db = await getDb();
  return db.getAllFromIndex("cache", "by-module", module);
}

export async function deleteCacheEntry(module: string, key: string) {
  const db = await getDb();
  await db.delete("cache", cacheKey(module, key));
}
