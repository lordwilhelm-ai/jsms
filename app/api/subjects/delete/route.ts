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
      return NextResponse.json({ error: "Subject ID is required." }, { status: 400 });
    }

    const { data: subjectRow, error: subjectError } = await supabaseAdmin
      .from("subjects")
      .select("id, subject_name, name")
      .eq("id", id)
      .maybeSingle();

    if (subjectError) throw new Error(subjectError.message);
    if (!subjectRow) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    const subjectName = String(subjectRow.subject_name || subjectRow.name || "").trim();

    // jsms_report_scores stores subject_name as text (no subject_id FK), so
    // deleting the subject row can't orphan a foreign key there — but it can
    // still leave real, already-recorded grades pointing at a subject that no
    // longer exists in the picker. Treat that like real academic data: block
    // by default and only proceed once the caller explicitly confirms.
    let scoreCount = 0;
    if (subjectName) {
      const { count, error: scoreError } = await supabaseAdmin
        .from("jsms_report_scores")
        .select("id", { count: "exact", head: true })
        .eq("subject_name", subjectName);

      if (scoreError) throw new Error(scoreError.message);
      scoreCount = count || 0;
    }

    if (scoreCount > 0 && !force) {
      return NextResponse.json(
        {
          error: `This subject has ${scoreCount} recorded score${
            scoreCount === 1 ? "" : "s"
          } on report cards. Those historical scores will be kept, but the subject will disappear from future selection. Confirm to proceed.`,
          requiresConfirmation: true,
          scoreCount,
        },
        { status: 409 }
      );
    }

    // Link/assignment rows are cascaded — teacher_subjects and class_subjects
    // are just associations, not academic records, so it's safe to clean
    // them up automatically.
    const { error: deleteTeacherSubjectsError } = await supabaseAdmin
      .from("teacher_subjects")
      .delete()
      .eq("subject_id", id);

    if (deleteTeacherSubjectsError) {
      throw new Error(deleteTeacherSubjectsError.message);
    }

    const { error: deleteLinksError } = await supabaseAdmin
      .from("class_subjects")
      .delete()
      .eq("subject_id", id);

    if (deleteLinksError) {
      throw new Error(deleteLinksError.message);
    }

    const { error } = await supabaseAdmin
      .from("subjects")
      .delete()
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "SUBJECTS_DELETE",
      details: `Deleted subject "${subjectName || id}"${scoreCount > 0 ? ` (had ${scoreCount} recorded score(s) already on report cards)` : ""}.`,
    });

    return NextResponse.json({
      message: "Subject deleted successfully.",
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
