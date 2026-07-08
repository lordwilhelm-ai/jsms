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
    indexes: {
      "by-sync-status": SyncStatus;
    };
  };

  today: {
    key: string;
    value: TodayEntry;
  };
}

let dbPromise: Promise<IDBPDatabase<KioskDBSchema>> | null = null;


function getDb() {
  if (typeof window === "undefined") {
    throw new Error("Kiosk database only works in browser");
  }

  if (!dbPromise) {
    dbPromise = openDB<KioskDBSchema>(
      DB_NAME,
      DB_VERSION,
      {
        upgrade(db) {

          if (!db.objectStoreNames.contains("teachers")) {
            db.createObjectStore("teachers", {
              keyPath: "teacher_id",
            });
          }


          if (!db.objectStoreNames.contains("pending")) {
            const store = db.createObjectStore("pending", {
              keyPath: "offline_id",
            });

            store.createIndex(
              "by-sync-status",
              "sync_status"
            );
          }


          if (!db.objectStoreNames.contains("today")) {
            db.createObjectStore("today", {
              keyPath: "teacher_id",
            });
          }

        },
      }
    );
  }

  return dbPromise;
}


// =========================
// TEACHERS CACHE
// =========================

export async function getAllCachedTeachers() {

  const db = await getDb();

  return db.getAll("teachers");

}


export async function getCachedTeacher(
  teacherId:string
) {

  const db = await getDb();

  return db.get(
    "teachers",
    teacherId
  );

}


export async function bulkPutCachedTeachers(
  teachers:CachedTeacher[]
) {

  const db = await getDb();

  const tx = db.transaction(
    "teachers",
    "readwrite"
  );


  for (const teacher of teachers) {
    await tx.store.put(teacher);
  }


  await tx.done;

}



export async function replaceCachedTeachers(
  teachers:CachedTeacher[]
){

  const db = await getDb();

  const tx = db.transaction(
    "teachers",
    "readwrite"
  );


  await tx.store.clear();


  for (const teacher of teachers){
    await tx.store.put(teacher);
  }


  await tx.done;

}



// =========================
// PENDING OFFLINE QUEUE
// =========================


export async function getAllPending(){

  const db = await getDb();

  return db.getAll("pending");

}



export async function getPendingByStatus(
  status:SyncStatus
){

  const db = await getDb();

  return db.getAllFromIndex(
    "pending",
    "by-sync-status",
    status
  );

}



export async function queuePending(
  record:PendingRecord
){

  const db = await getDb();


  await db.put(
    "pending",
    {
      ...record,
      created_at:
        record.created_at ??
        new Date().toISOString()
    }
  );

}



export async function updatePendingStatus(
  offlineId:string,
  status:SyncStatus
){

  const db = await getDb();

  const record =
    await db.get(
      "pending",
      offlineId
    );


  if(!record) return;


  record.sync_status = status;


  await db.put(
    "pending",
    record
  );

}



export async function removePending(
  offlineId:string
){

  const db = await getDb();

  await db.delete(
    "pending",
    offlineId
  );

}



export async function clearPending(){

  const db = await getDb();

  await db.clear(
    "pending"
  );

}



// =========================
// TODAY LOCAL ATTENDANCE
// =========================


export async function getAllTodayEntries(){

  const db = await getDb();

  return db.getAll(
    "today"
  );

}



export async function getTodayEntry(
  teacherId:string
){

  const db = await getDb();

  return db.get(
    "today",
    teacherId
  );

}



export async function upsertTodayEntry(
  entry:TodayEntry
){

  const db = await getDb();

  await db.put(
    "today",
    entry
  );

}



export async function deleteTodayEntry(
  teacherId:string
){

  const db = await getDb();

  await db.delete(
    "today",
    teacherId
  );

}



export async function bulkPutTodayEntries(
  entries:TodayEntry[]
){

  const db = await getDb();


  const tx = db.transaction(
    "today",
    "readwrite"
  );


  for(const entry of entries){
    await tx.store.put(entry);
  }


  await tx.done;

}



export async function clearTodayEntries(){

  const db = await getDb();

  await db.clear(
    "today"
  );

}



// Merge server data without overwriting
// offline changes

export async function mergeTodayEntriesFromServer(
  entries:TodayEntry[]
){

  const db = await getDb();

  const tx = db.transaction(
    "today",
    "readwrite"
  );


  for(const entry of entries){

    const local =
      await tx.store.get(
        entry.teacher_id
      );


    if(
      !local ||
      local.synced
    ){
      await tx.store.put(entry);
    }

  }


  await tx.done;

}



export async function markTodayEntrySynced(
  teacherId:string
){

  const db = await getDb();


  const entry =
    await db.get(
      "today",
      teacherId
    );


  if(!entry) return;


  entry.synced = true;


  await db.put(
    "today",
    entry
  );

}