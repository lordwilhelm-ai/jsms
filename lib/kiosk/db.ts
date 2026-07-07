import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DB_NAME = "jvst-kiosk-db";
const DB_VERSION = 1;

export interface CachedTeacher {
  teacher_id: string;
  full_name: string;
  username: string;
  pin_hash: string;
  photo_url?: string | null;
  assigned_classes?: string | null;
  is_active: boolean;
  is_visible: boolean;
}

export interface TodayEntry {
  teacher_id: string;
  teacher_name: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_status: "Present" | "Late";
  is_on_duty: boolean;
  offline_id: string | null;
  synced: boolean;
}

export type SyncStatus = "pending" | "syncing" | "failed";

export interface PendingRecord {
  offline_id: string;
  teacher_id: string;
  teacher_name: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_status: "Present" | "Late";
  is_on_duty: boolean;
  sync_status: SyncStatus;
  created_at: string;
}

interface KioskDBSchema extends DBSchema {
  teachers: {
    key: string;
    value: CachedTeacher;
  };
  pending: {
    key: string;
    value: PendingRecord;
    indexes: { "by-sync-status": string };
  };
  today: {
    key: string;
    value: TodayEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<KioskDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<KioskDBSchema>> {
  if (typeof window === "undefined") {
    throw new Error("kiosk db can only be used in the browser");
  }

  if (!dbPromise) {
    dbPromise = openDB<KioskDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("teachers")) {
          db.createObjectStore("teachers", { keyPath: "teacher_id" });
        }
        if (!db.objectStoreNames.contains("pending")) {
          const store = db.createObjectStore("pending", { keyPath: "offline_id" });
          store.createIndex("by-sync-status", "sync_status");
        }
        if (!db.objectStoreNames.contains("today")) {
          db.createObjectStore("today", { keyPath: "teacher_id" });
        }
      },
    });
  }

  return dbPromise;
}

// ---------- teachers ----------

export async function getAllCachedTeachers(): Promise<CachedTeacher[]> {
  const db = await getDb();
  return db.getAll("teachers");
}

export async function getCachedTeacher(teacherId: string): Promise<CachedTeacher | undefined> {
  const db = await getDb();
  return db.get("teachers", teacherId);
}

export async function bulkPutCachedTeachers(teachers: CachedTeacher[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("teachers", "readwrite");
  await Promise.all([...teachers.map((t) => tx.store.put(t)), tx.done]);
}

export async function replaceCachedTeachers(teachers: CachedTeacher[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("teachers", "readwrite");
  await tx.store.clear();
  await Promise.all([...teachers.map((t) => tx.store.put(t)), tx.done]);
}

// ---------- pending ----------

export async function getAllPending(): Promise<PendingRecord[]> {
  const db = await getDb();
  return db.getAll("pending");
}

export async function queuePending(record: PendingRecord): Promise<void> {
  const db = await getDb();
  await db.put("pending", record);
}

export async function updatePendingStatus(offlineId: string, status: SyncStatus): Promise<void> {
  const db = await getDb();
  const existing = await db.get("pending", offlineId);
  if (!existing) return;
  existing.sync_status = status;
  await db.put("pending", existing);
}

export async function removePending(offlineId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pending", offlineId);
}

// ---------- today ----------

export async function getAllTodayEntries(): Promise<TodayEntry[]> {
  const db = await getDb();
  return db.getAll("today");
}

export async function getTodayEntry(teacherId: string): Promise<TodayEntry | undefined> {
  const db = await getDb();
  return db.get("today", teacherId);
}

export async function upsertTodayEntry(entry: TodayEntry): Promise<void> {
  const db = await getDb();
  await db.put("today", entry);
}

export async function bulkPutTodayEntries(entries: TodayEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("today", "readwrite");
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

export async function mergeTodayEntriesFromServer(entries: TodayEntry[]): Promise<void> {
  // Only overwrite entries that are already marked as synced locally,
  // so we never clobber an unsynced local check-in/out with stale server data.
  const db = await getDb();
  const tx = db.transaction("today", "readwrite");
  for (const entry of entries) {
    const local = await tx.store.get(entry.teacher_id);
    if (!local || local.synced) {
      await tx.store.put(entry);
    }
  }
  await tx.done;
}

export async function markTodayEntrySynced(teacherId: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get("today", teacherId);
  if (!existing) return;
  existing.synced = true;
  await db.put("today", existing);
}
