import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { verifyTeacherScope } from "@/lib/teacherAssignments";
import { checkReportCardLicense } from "@/lib/reportCardLicense";
import { logActivity, actorName } from "@/lib/activityLog";

// Teachers write scores with the anon client today via RLS, but
// jsms_report_scores has no INSERT/UPDATE policy permitting that — every
// save fails with "new row violates row-level security policy". Proxy the
// write through here with the service role instead of trying to reverse
// engineer the right RLS policy from the client.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to save." }, { status: 400 });
    }

    // A teacher can only ever pick their own assigned class/subject in the
    // UI, but nothing stopped a direct API call from writing another
    // teacher's class — enforce the same scope server-side. Owner/admin/
    // headmaster are trusted broadly, same as everywhere else in this app.
    if (auth.role === "teacher") {
      const scopeCheck = await verifyTeacherScope(auth.teacher.id, rows, { requireSubject: true });
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
      .from("jsms_report_scores")
      .upsert(rows, { onConflict: "student_id,academic_year,term,subject_name" });

    if (error) throw error;

    const classNames = Array.from(new Set(rows.map((row: any) => row.class_name).filter(Boolean)));
    const term = rows[0]?.term;

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "REPORT_CARD_SAVE_SCORES",
      className: classNames.join(", ") || null,
      details: `Saved ${rows.length} score row(s) for ${classNames.join(", ") || "class"}${term ? ` (${term})` : ""}.`,
    });

    return NextResponse.json({ message: "Results saved successfully." });
  } catch (error) {
    console.error("Save report scores error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to save results.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
