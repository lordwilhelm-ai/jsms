import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const FILTERABLE_COLUMNS = ["class_name", "subject_name", "academic_year", "term", "student_id"];

// jsms_report_scores has RLS enabled with zero policies, so every read via
// the browser's anon-key client silently returns an empty array (no error)
// regardless of who's logged in. Proxy through here with the service role.
export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { searchParams } = new URL(request.url);
    let query = supabaseAdmin.from("jsms_report_scores").select("*");

    for (const column of FILTERABLE_COLUMNS) {
      const value = searchParams.get(column);
      if (value) query = query.eq(column, value);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ rows: data || [] });
  } catch (error) {
    console.error("Load report scores error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load scores.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
