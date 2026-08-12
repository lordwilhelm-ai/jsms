import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

// Staff-only: admits an applicant into the live students database.
// Previously called via supabase.rpc(...) straight from the browser with no
// server-side role check at all.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const applicationId = String(body.application_id || "").trim();

    if (!applicationId) {
      return NextResponse.json({ error: "Application ID is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc("admit_admission_student", {
      p_application_id: applicationId,
      p_admitted_by_user_id: auth.teacher.id || null,
      p_admitted_by_name: auth.teacher.full_name || auth.teacher.username || "Admin",
    });

    if (error) throw new Error(error.message);

    // admit_admission_student() creates the live student row but leaves
    // admission_term/admission_academic_year unset. getEffectiveStudentType()
    // (lib used by the fees routes) falls back to "new" forever when those
    // two fields are empty — so without this, every admitted student would
    // stay tagged "new" indefinitely instead of becoming a continuing
    // student once the term they joined in ends. Stamping them here with
    // the term they're actually joining fixes that for good.
    const { data: settings } = await supabaseAdmin
      .from("school_settings")
      .select("academic_year, current_term")
      .maybeSingle();

    if (settings?.academic_year && settings?.current_term) {
      await supabaseAdmin
        .from("students")
        .update({
          is_new: true,
          is_new_student: true,
          student_type: "new",
          admission_term: settings.current_term,
          admission_academic_year: settings.academic_year,
        })
        .eq("admission_application_id", applicationId);
    }

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "ADMISSION_ADMIT_STUDENT",
      details: `Admitted applicant (application ${applicationId}) into the live student database.`,
    });

    return NextResponse.json({ message: "Student admitted successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
