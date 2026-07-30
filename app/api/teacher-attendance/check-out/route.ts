import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { validateAttendanceLocation } from "@/lib/teacherAttendanceGeofence";
import { getGhanaDateString } from "@/lib/ghanaTime";
import { logActivity, actorName } from "@/lib/activityLog";

function getTeacherId(row: Record<string, any>) {
  return String(row.teacher_id || row.id || "").trim();
}

// Same trust-the-session fix as check-in: resolve teacher_id server-side from
// the authenticated staff record rather than accepting it from the request.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const teacherId = getTeacherId(auth.teacher);
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
      .select("id, check_in_time, check_out_time")
      .eq("teacher_id", teacherId)
      .eq("attendance_date", today)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing?.check_in_time) {
      return NextResponse.json({ error: "You must check in first." }, { status: 400 });
    }

    if (existing.check_out_time) {
      return NextResponse.json({ error: "Already checked out today." }, { status: 409 });
    }

    const now = new Date();

    const { data, error } = await supabaseAdmin
      .from("teacher_attendance")
      .update({
        check_out_time: now.toISOString(),
        latitude,
        longitude,
      })
      .eq("id", existing.id)
      .select()
      .maybeSingle();

    if (error) throw error;

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "ATTENDANCE_CHECK_OUT",
      details: `${actorName(auth.teacher)} checked out on ${today}.`,
    });

    return NextResponse.json({ message: "Check-out recorded successfully.", attendance: data });
  } catch (error) {
    console.error("Teacher check-out error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Check-out failed.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
