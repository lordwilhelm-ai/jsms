import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

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

    const { error } = await supabaseAdmin
      .from("jsms_report_scores")
      .upsert(rows, { onConflict: "student_id,academic_year,term,subject_name" });

    if (error) throw error;

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
