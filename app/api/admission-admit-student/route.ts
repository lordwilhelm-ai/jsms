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
