import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { verifyStaffPin } from "@/lib/verifyStaffPin";
import { deleteRecordRow, RECORD_TYPES } from "@/lib/recordManagement";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json().catch(() => ({}));
    const logId = cleanText(body?.logId);
    const pin = cleanText(body?.pin);

    if (!logId) {
      return NextResponse.json({ error: "Log entry id is required." }, { status: 400 });
    }

    const pinCheck = await verifyStaffPin(auth.teacher.id, pin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error, code: pinCheck.code }, { status: pinCheck.status });
    }

    const { data: log, error: logError } = await supabaseAdmin
      .from("activity_logs")
      .select("*")
      .eq("id", logId)
      .maybeSingle();
    if (logError) throw new Error(logError.message);
    if (!log) {
      return NextResponse.json({ error: "Activity log entry not found." }, { status: 404 });
    }
    if (log.undone_at) {
      return NextResponse.json({ error: "This entry has already been undone." }, { status: 409 });
    }
    if (log.undo_type !== "DELETE_RECORD") {
      return NextResponse.json({ error: "This entry can't be undone." }, { status: 400 });
    }

    const payload = log.undo_payload || {};
    const recordType = cleanText(payload.recordType);
    const recordId = cleanText(payload.id);

    if (!RECORD_TYPES[recordType] || !recordId) {
      return NextResponse.json({ error: "Malformed undo payload." }, { status: 400 });
    }

    await deleteRecordRow(recordType, recordId);

    const staffName = actorName(auth.teacher);

    const { error: markError } = await supabaseAdmin
      .from("activity_logs")
      .update({ undone_at: new Date().toISOString(), undone_by: staffName })
      .eq("id", logId);
    if (markError) throw new Error(markError.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "ACTIVITY_LOG_UNDO",
      className: log.class_name ?? null,
      details: `Undid "${log.action}" originally recorded by ${log.user_name}: ${log.details}`,
    });

    return NextResponse.json({ message: "Undone successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
