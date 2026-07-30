import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

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
      .from("teacher_class_assignments")
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
        assignment_type: "assigned",
      }));

      const { error: insertClassesError } = await supabaseAdmin
        .from("teacher_class_assignments")
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

    const { data: teacherRow } = await supabaseAdmin
      .from("teachers")
      .select("full_name, username")
      .eq("id", teacherId)
      .maybeSingle();

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "STAFF_SAVE_ASSIGNMENTS",
      details: `Assigned ${classIds.length} class(es) and ${subjectIds.length} subject(s) to "${teacherRow?.full_name || teacherRow?.username || teacherId}".`,
    });

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
