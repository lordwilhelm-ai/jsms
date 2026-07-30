import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = String(body.id || "").trim();
    const force = body.force === true;

    if (!id) {
      return NextResponse.json({ error: "Class ID is required." }, { status: 400 });
    }

    const { data: classRow, error: classError } = await supabaseAdmin
      .from("classes")
      .select("id, class_name, name")
      .eq("id", id)
      .maybeSingle();

    if (classError) throw new Error(classError.message);
    if (!classRow) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }

    const className = String(classRow.class_name || classRow.name || "").trim();

    // Students are real records, not link rows — never silently orphan or
    // cascade-delete them. Block the delete (even with force) until they've
    // been moved or removed first.
    const studentQuery = supabaseAdmin
      .from("students")
      .select("id", { count: "exact", head: true });

    const { count: studentsByIdCount, error: studentsByIdError } = await studentQuery.eq(
      "class_id",
      id
    );
    if (studentsByIdError) throw new Error(studentsByIdError.message);

    let studentsByNameCount = 0;
    if (className) {
      const { count, error: studentsByNameError } = await supabaseAdmin
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("class_name", className);

      if (studentsByNameError) throw new Error(studentsByNameError.message);
      studentsByNameCount = count || 0;
    }

    const studentCount = Math.max(studentsByIdCount || 0, studentsByNameCount);

    if (studentCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete this class: ${studentCount} student${
            studentCount === 1 ? " is" : "s are"
          } still assigned to it. Move or remove those students first.`,
          studentCount,
        },
        { status: 409 }
      );
    }

    const [
      { count: assignmentCount, error: assignmentError },
      { count: teacherSubjectCount, error: teacherSubjectError },
      { count: classSubjectCount, error: classSubjectError },
    ] = await Promise.all([
      supabaseAdmin
        .from("teacher_class_assignments")
        .select("id", { count: "exact", head: true })
        .eq("class_id", id),
      supabaseAdmin
        .from("teacher_subjects")
        .select("id", { count: "exact", head: true })
        .eq("class_id", id),
      supabaseAdmin
        .from("class_subjects")
        .select("id", { count: "exact", head: true })
        .eq("class_id", id),
    ]);

    if (assignmentError) throw new Error(assignmentError.message);
    if (teacherSubjectError) throw new Error(teacherSubjectError.message);
    if (classSubjectError) throw new Error(classSubjectError.message);

    const dependentCount =
      (assignmentCount || 0) + (teacherSubjectCount || 0) + (classSubjectCount || 0);

    if (dependentCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `This class has ${assignmentCount || 0} teacher assignment(s), ${
            teacherSubjectCount || 0
          } teacher-subject link(s), and ${
            classSubjectCount || 0
          } class-subject link(s). Deleting will remove those links too. Confirm to proceed.`,
          requiresConfirmation: true,
          assignmentCount: assignmentCount || 0,
          teacherSubjectCount: teacherSubjectCount || 0,
          classSubjectCount: classSubjectCount || 0,
        },
        { status: 409 }
      );
    }

    // Only link/assignment rows are cascaded — never student records.
    const { error: assignmentDeleteError } = await supabaseAdmin
      .from("teacher_class_assignments")
      .delete()
      .eq("class_id", id);
    if (assignmentDeleteError) throw new Error(assignmentDeleteError.message);

    const { error: teacherSubjectDeleteError } = await supabaseAdmin
      .from("teacher_subjects")
      .delete()
      .eq("class_id", id);
    if (teacherSubjectDeleteError) throw new Error(teacherSubjectDeleteError.message);

    const { error: classSubjectDeleteError } = await supabaseAdmin
      .from("class_subjects")
      .delete()
      .eq("class_id", id);
    if (classSubjectDeleteError) throw new Error(classSubjectDeleteError.message);

    const { error } = await supabaseAdmin
      .from("classes")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "CLASSES_DELETE",
      className,
      details: `Deleted class "${className}"${
        dependentCount > 0 ? ` (removed ${dependentCount} teacher/subject link(s) with it)` : ""
      }.`,
    });

    return NextResponse.json({
      message: "Class deleted successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Something went wrong.",
      },
      { status: 500 }
    );
  }
}
