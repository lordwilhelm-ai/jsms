import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { verifyTeacherScope } from "@/lib/teacherAssignments";
import { checkReportCardLicense } from "@/lib/reportCardLicense";

// Same fix as /api/report-card/save-scores: jsms_report_attendance has no
// RLS policy permitting the teacher's own session to write, so proxy
// through here with the service role instead.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to save." }, { status: 400 });
    }

    // A teacher can only ever pick their own assigned class in the UI, but
    // nothing stopped a direct API call from writing another teacher's
    // class — enforce the same scope server-side. Owner/admin/headmaster
    // are trusted broadly, same as everywhere else in this app.
    if (auth.role === "teacher") {
      const scopeCheck = await verifyTeacherScope(auth.teacher.id, rows);
      if (!scopeCheck.ok) {
        return NextResponse.json({ error: scopeCheck.error }, { status: 403 });
      }
    }

    // Mirrors the client-side "Payment Required" gate (hooks/useReportCardAccess)
    // so a school that hasn't paid can't bypass it by calling this route directly.
    const license = await checkReportCardLicense();
    if (!license.ok) {
      return NextResponse.json({ error: license.reason }, { status: 402 });
    }

    const { error } = await supabaseAdmin
      .from("jsms_report_attendance")
      .upsert(rows, { onConflict: "student_id,academic_year,term" });

    if (error) throw error;

    return NextResponse.json({ message: "Attendance saved successfully." });
  } catch (error) {
    console.error("Save report attendance error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to save attendance.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
