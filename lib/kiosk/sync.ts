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
const ATTENDANCE_TABLE = "teacher_attendance";


export async function queuePendingRecord(
  record: PendingRecord
): Promise<void> {
  await queuePending(record);
}


/**
 * Cache teachers locally
 */
export async function refreshTeacherCache(): Promise<void> {

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) return;


  try {

    const { data, error } = await supabase
      .from(TEACHERS_TABLE)
      .select(`
        teacher_id,
        full_name,
        username,
        pin_hash,
        photo_url,
        assigned_classes,
        is_active,
        is_visible
      `)
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("full_name");


    if (error) {
      console.error(
        "Teacher cache error:",
        error.message,
        error.details,
        error.hint
      );
      return;
    }


    const teachers: CachedTeacher[] =
      (data ?? []).map((teacher) => ({
        teacher_id: teacher.teacher_id,
        full_name: teacher.full_name ?? "",
        username: teacher.username ?? "",
        pin_hash: teacher.pin_hash ?? "",
        photo_url: teacher.photo_url ?? null,
        assigned_classes:
          teacher.assigned_classes ?? null,
        is_active:
          Boolean(teacher.is_active),
        is_visible:
          Boolean(teacher.is_visible),
      }));


    await replaceCachedTeachers(
      teachers
    );


    console.log(
      `Teacher cache: ${teachers.length}`
    );


  } catch(error) {

    console.error(
      "refreshTeacherCache crash:",
      error
    );

  }

}



/**
 * Cache today's attendance
 */
export async function refreshTodayCache(): Promise<void> {

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) return;


  try {

    const today =
      toIsoDate(new Date());


    const { data, error } = await supabase
      .from(ATTENDANCE_TABLE)
      .select(`
        teacher_id,
        teacher_name,
        attendance_date,
        check_in_time,
        check_out_time,
        check_in_status,
        is_on_duty,
        offline_id
      `)
      .eq(
        "attendance_date",
        today
      );


    if(error){

      console.error(
        "Attendance cache error:",
        error.message,
        error.details,
        error.hint
      );

      return;
    }


    const entries: TodayEntry[] =
      (data ?? []).map((item)=>({

        teacher_id:
          item.teacher_id,

        teacher_name:
          item.teacher_name ?? "",

        attendance_date:
          item.attendance_date,

        check_in_time:
          item.check_in_time ?? null,

        check_out_time:
          item.check_out_time ?? null,

        check_in_status:
          item.check_in_status ?? null,

        is_on_duty:
          Boolean(item.is_on_duty),

        offline_id:
          item.offline_id,

        synced:true,

      }));


    await bulkPutTodayEntries(
      entries
    );


  } catch(error){

    console.error(
      "refreshTodayCache crash:",
      error
    );

  }

}



/**
 * Sync offline records
 *
 * IMPORTANT: the conflict target must be (teacher_id, attendance_date) —
 * that is the real one-row-per-teacher-per-day identity used everywhere
 * else in this app (portal check-in/out, phone check-in, etc). A row for
 * today may already exist with offline_id = null (created from a phone or
 * the portal). Upserting on "offline_id" would try to INSERT a brand new
 * row in that case, which then collides with the (teacher_id,
 * attendance_date) unique constraint and fails with a duplicate-key
 * error — that was the "2 pending / not sending" bug.
 */
export async function syncPendingRecords(): Promise<void> {

  if (
    typeof navigator !== "undefined" &&
    !navigator.onLine
  ) return;


  const pending =
    await getAllPending();


  if(!pending.length){
    console.log(
      "No pending attendance"
    );
    return;
  }


  console.log(
    `Syncing ${pending.length} records`
  );


  for(const record of pending){


    try {


      await updatePendingStatus(
        record.offline_id,
        "syncing"
      );


      const payload = {

        teacher_id:
          record.teacher_id,

        teacher_name:
          record.teacher_name,

        attendance_date:
          record.attendance_date,

        check_in_time:
          record.check_in_time ?? null,

        check_out_time:
          record.check_out_time ?? null,

        check_in_status:
          record.check_in_status ?? null,

        is_on_duty:
          Boolean(record.is_on_duty),

        marked_by:
          "KIOSK",

        offline_id:
          record.offline_id,

        sync_status:
          "synced",

        synced_at:
          new Date().toISOString(),

      };


      console.log(
        "Uploading:",
        payload
      );


      const { data, error } =
        await supabase
          .from(ATTENDANCE_TABLE)
          .upsert(
            payload,
            {
              onConflict:
                "teacher_id,attendance_date",
              ignoreDuplicates:false,
            }
          )
          .select();


      if(error){


        console.error(
          "SUPABASE SYNC ERROR",
          {
            message:error.message,
            details:error.details,
            hint:error.hint,
            code:error.code,
          }
        );


        await updatePendingStatus(
          record.offline_id,
          "failed"
        );


        continue;

      }


      console.log(
        "Uploaded:",
        data
      );


      await removePending(
        record.offline_id
      );


      await markTodayEntrySynced(
        record.teacher_id
      );


      console.log(
        `Synced ${record.teacher_name}`
      );


    }catch(error){


      console.error(
        "Sync exception:",
        error
      );


      await updatePendingStatus(
        record.offline_id,
        "failed"
      );

    }

  }


  console.log(
    "Sync finished"
  );

}



/**
 * Complete kiosk refresh
 */
export async function refreshKioskData(){

  await syncPendingRecords();

  await refreshTeacherCache();

  await refreshTodayCache();

}
