import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// Same fix as /api/report-card/save-scores: jsms_report_cards has no
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

    const { error } = await supabaseAdmin
      .from("jsms_report_cards")
      .upsert(rows, { onConflict: "student_id,academic_year,term" });

    if (error) throw error;

    return NextResponse.json({ message: "Remarks saved successfully." });
  } catch (error) {
    console.error("Save report remarks error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to save remarks.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
