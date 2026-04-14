import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const teacherId = String(body.teacher_id || "").trim();
    const classIds = Array.isArray(body.class_ids)
      ? body.class_ids.map((id: string) => String(id))
      : [];
    const subjectIds = Array.isArray(body.subject_ids)
      ? body.subject_ids.map((id: string) => String(id))
      : [];

    if (!teacherId) {
      return NextResponse.json({ error: "Teacher ID is required." }, { status: 400 });
    }

    const { error: deleteClassesError } = await supabaseAdmin
      .from("teacher_classes")
      .delete()
      .eq("teacher_id", teacherId);

    if (deleteClassesError) throw deleteClassesError;

    const { error: deleteSubjectsError } = await supabaseAdmin
      .from("teacher_subjects")
      .delete()
      .eq("teacher_id", teacherId);

    if (deleteSubjectsError) throw deleteSubjectsError;

    if (classIds.length > 0) {
      const classRows = classIds.map((classId: string) => ({
        teacher_id: teacherId,
        class_id: classId,
      }));

      const { error: insertClassesError } = await supabaseAdmin
        .from("teacher_classes")
        .insert(classRows);

      if (insertClassesError) throw insertClassesError;
    }

    if (subjectIds.length > 0) {
      const subjectRows = subjectIds.map((subjectId: string) => ({
        teacher_id: teacherId,
        subject_id: subjectId,
      }));

      const { error: insertSubjectsError } = await supabaseAdmin
        .from("teacher_subjects")
        .insert(subjectRows);

      if (insertSubjectsError) throw insertSubjectsError;
    }

    return NextResponse.json({
      message: "Assignments saved successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
