import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { validateAttendanceLocation } from "@/lib/teacherAttendanceGeofence";
import {
  getGhanaCheckInStatus,
  getGhanaDateString,
  getGhanaEndOfWeekSunday,
  getGhanaStartOfWeekMonday,
} from "@/lib/ghanaTime";
import { logActivity } from "@/lib/activityLog";

function getTeacherId(row: Record<string, any>) {
  return String(row.teacher_id || row.id || "").trim();
}

function getTeacherName(row: Record<string, any>) {
  return String(row.full_name || row.name || "Teacher").trim();
}

// Check-in previously called supabase.from("teacher_attendance").upsert(...)
// straight from the browser with the anon key, keyed by a teacher_id read
// from client state — anyone with devtools and a valid session could send a
// different teacher_id and mark someone else present. This route resolves
// the identity from the authenticated session (via requireStaffRole's
// teachers lookup) and re-validates the geofence server-side instead of
// trusting the client's own pass/fail judgment.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const teacherId = getTeacherId(auth.teacher);
    const teacherName = getTeacherName(auth.teacher);

    if (!teacherId) {
      return NextResponse.json(
        { error: "Could not resolve your teacher record." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    const accuracy = Number(body?.accuracy);

    const geo = await validateAttendanceLocation({ latitude, longitude, accuracy });
    if (!geo.ok) {
      return NextResponse.json({ error: geo.error }, { status: 400 });
    }

    const today = getGhanaDateString();

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("teacher_attendance")
      .select("id, check_in_time")
      .eq("teacher_id", teacherId)
      .eq("attendance_date", today)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing?.check_in_time) {
      return NextResponse.json({ error: "Already checked in today." }, { status: 409 });
    }

    const weekStart = getGhanaStartOfWeekMonday(today);
    const weekEnd = getGhanaEndOfWeekSunday(today);

    const { data: dutyRows, error: dutyError } = await supabaseAdmin
      .from("teacher_duty_roster")
      .select("id")
      .eq("teacher_id", teacherId)
      .gte("week_start_date", weekStart)
      .lte("week_start_date", weekEnd)
      .limit(1);

    if (dutyError) throw dutyError;

    const isOnDuty = Boolean(dutyRows && dutyRows.length > 0);
    const now = new Date();
    const checkInStatus = getGhanaCheckInStatus(now, isOnDuty);

    const payload = {
      teacher_id: teacherId,
      teacher_name: teacherName,
      attendance_date: today,
      check_in_time: now.toISOString(),
      check_in_status: checkInStatus,
      is_on_duty: isOnDuty,
      latitude,
      longitude,
      marked_by: teacherName,
    };

    const { data, error } = await supabaseAdmin
      .from("teacher_attendance")
      .upsert(payload, { onConflict: "teacher_id,attendance_date" })
      .select()
      .maybeSingle();

    if (error) throw error;

    void logActivity({
      userName: teacherName,
      role: auth.role,
      action: "ATTENDANCE_CHECK_IN",
      details: `${teacherName} checked in${checkInStatus === "Late" ? " (late)" : ""} on ${today}.`,
    });

    return NextResponse.json({
      message:
        checkInStatus === "Late"
          ? "Check-in recorded. You are marked late."
          : "Check-in recorded successfully.",
      attendance: data,
    });
  } catch (error) {
    console.error("Teacher check-in error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Check-in failed.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
