import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const FILTERABLE_COLUMNS = ["class_name", "academic_year", "term", "student_id"];

// Same read-side RLS gap as /api/report-card/scores, for jsms_report_attendance.
export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { searchParams } = new URL(request.url);
    let query = supabaseAdmin.from("jsms_report_attendance").select("*");

    for (const column of FILTERABLE_COLUMNS) {
      const value = searchParams.get(column);
      if (value) query = query.eq(column, value);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ rows: data || [] });
  } catch (error) {
    console.error("Load report attendance error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load attendance.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
