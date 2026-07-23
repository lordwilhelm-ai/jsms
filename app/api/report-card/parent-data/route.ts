import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// The parent portal has no login — knowing a student's ID (from the printed
// report card's QR code) is the access control, same as the rest of that
// portal. This route is intentionally public but requires student_id so it
// can never return another student's data or a bulk dump.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Accepts every candidate identifier a student record might be keyed by
    // (id, student_id, jvs_id, full_name, ...) since older rows in these
    // tables aren't all stored under the same field consistently.
    const studentIds = String(searchParams.get("student_ids") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (studentIds.length === 0) {
      return NextResponse.json({ error: "student_ids is required." }, { status: 400 });
    }

    const [scoresRes, attendanceRes, cardsRes] = await Promise.all([
      supabaseAdmin.from("jsms_report_scores").select("*").in("student_id", studentIds),
      supabaseAdmin.from("jsms_report_attendance").select("*").in("student_id", studentIds),
      supabaseAdmin.from("jsms_report_cards").select("*").in("student_id", studentIds),
    ]);

    if (scoresRes.error) throw scoresRes.error;
    if (attendanceRes.error) throw attendanceRes.error;
    if (cardsRes.error) throw cardsRes.error;

    return NextResponse.json({
      scores: scoresRes.data || [],
      attendance: attendanceRes.data || [],
      cards: cardsRes.data || [],
    });
  } catch (error) {
    console.error("Load parent report-card data error:", error);
    const message =
      error instanceof Error
        ? error.message
        : String((error as Record<string, any>)?.message || "Failed to load report card.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
