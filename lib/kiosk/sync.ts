import { supabase } from "@/lib/supabase";
import {
  bulkPutTodayEntries,
  getAllPending,
  markTodayEntrySynced,
  queuePending,
  removePending,
  replaceCachedTeachers,
  updatePendingStatus,
  type CachedTeacher,
  type PendingRecord,
  type TodayEntry,
} from "@/lib/kiosk/db";
import { toIsoDate } from "@/lib/kiosk/format";

const TEACHERS_TABLE = "teachers";
const ATTENDANCE_TABLE = "attendance";

/**
 * Queue a check-in / check-out for sync. Writes to the local pending
 * store immediately so it works fully offline.
 */
export async function queuePendingRecord(record: PendingRecord): Promise<void> {
  await queuePending(record);
}

/**
 * Pull the latest active/visible teacher roster (with pin hashes) from
 * Supabase and replace the local cache. No-ops silently if offline or
 * if the request fails, so the kiosk keeps working on stale cache.
 */
export async function refreshTeacherCache(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  try {
    const { data, error } = await supabase
      .from(TEACHERS_TABLE)
      .select("teacher_id, full_name, username, pin_hash, photo_url, assigned_classes, is_active, is_visible")
      .eq("is_active", true)
      .eq("is_visible", true);

    if (error || !data) return;

    const teachers: CachedTeacher[] = data.map((row) => ({
      teacher_id: row.teacher_id,
      full_name: row.full_name,
      username: row.username,
      pin_hash: row.pin_hash,
      photo_url: row.photo_url ?? null,
      assigned_classes: row.assigned_classes ?? null,
      is_active: row.is_active,
      is_visible: row.is_visible,
    }));

    await replaceCachedTeachers(teachers);
  } catch {
    // stay on cached data if the network call throws
  }
}

/**
 * Pull today's attendance rows from Supabase and merge them into the
 * local "today" store. Local unsynced entries are never overwritten.
 */
export async function refreshTodayCache(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const today = toIsoDate(new Date());

  try {
    const { data, error } = await supabase
      .from(ATTENDANCE_TABLE)
      .select(
        "teacher_id, teacher_name, attendance_date, check_in_time, check_out_time, check_in_status, is_on_duty, offline_id"
      )
      .eq("attendance_date", today);

    if (error || !data) return;

    const entries: TodayEntry[] = data.map((row) => ({
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      attendance_date: row.attendance_date,
      check_in_time: row.check_in_time,
      check_out_time: row.check_out_time,
      check_in_status: row.check_in_status,
      is_on_duty: Boolean(row.is_on_duty),
      offline_id: row.offline_id,
      synced: true,
    }));

    await bulkPutTodayEntries(entries);
  } catch {
    // stay on cached data if the network call throws
  }
}

/**
 * Push all locally queued check-in/out records to Supabase. Uses
 * offline_id as the natural key so re-syncs are idempotent (upsert).
 */
export async function syncPendingRecords(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const pending = await getAllPending();
  if (pending.length === 0) return;

  for (const record of pending) {
    await updatePendingStatus(record.offline_id, "syncing");

    try {
      const { error } = await supabase.from(ATTENDANCE_TABLE).upsert(
        {
          teacher_id: record.teacher_id,
          teacher_name: record.teacher_name,
          attendance_date: record.attendance_date,
          check_in_time: record.check_in_time,
          check_out_time: record.check_out_time,
          check_in_status: record.check_in_status,
          is_on_duty: record.is_on_duty,
          marked_by: record.teacher_name,
          offline_id: record.offline_id,
          sync_status: "synced",
          synced_at: new Date().toISOString(),
        },
        { onConflict: "offline_id" }
      );

      if (error) {
        await updatePendingStatus(record.offline_id, "failed");
        continue;
      }

      await removePending(record.offline_id);
      await markTodayEntrySynced(record.teacher_id);
    } catch {
      await updatePendingStatus(record.offline_id, "failed");
    }
  }
}
