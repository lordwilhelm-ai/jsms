import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = String(searchParams.get("teacher_id") || "").trim();

    if (!teacherId) {
      return NextResponse.json({ error: "Teacher ID is required." }, { status: 400 });
    }

    const [classRes, subjectRes] = await Promise.all([
      supabaseAdmin
        .from("teacher_classes")
        .select("class_id")
        .eq("teacher_id", teacherId),
      supabaseAdmin
        .from("teacher_subjects")
        .select("subject_id")
        .eq("teacher_id", teacherId),
    ]);

    if (classRes.error) throw classRes.error;
    if (subjectRes.error) throw subjectRes.error;

    return NextResponse.json({
      class_ids: (classRes.data || []).map((row) => row.class_id),
      subject_ids: (subjectRes.data || []).map((row) => row.subject_id),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
