import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const FILTERABLE_COLUMNS = ["class_name", "academic_year", "term", "student_id"];

// Same read-side RLS gap as /api/report-card/scores, for jsms_report_cards
// (remarks/conduct/attitude etc.).
export async function GET(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster", "teacher"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { searchParams } = new URL(request.url);
    let query = supabaseAdmin.from("jsms_report_cards").select("*");

    for (const column of FILTERABLE_COLUMNS) {
      const value = searchParams.get(column);
      if (value) query = query.eq(column, value);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ rows: data || [] });
  } catch (error) {
    console.error("Load report cards error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load remarks.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
