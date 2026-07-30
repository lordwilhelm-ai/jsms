import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

// Record Payment's "Save Setup" used to write straight to `students` with the
// anon-key browser client, gated only by a client-side "redirect if teacher"
// check. This proxies the write through the service role behind
// requireStaffRole() so a direct API call can't rewrite a student's
// arrears/scholarship without an authorized staff session.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const studentId = String(body?.studentId || "").trim();

    if (!studentId) {
      return NextResponse.json({ error: "Student ID is required." }, { status: 400 });
    }

    const scholarshipTypeMap: Record<string, string> = {
      regular: "none",
      full: "full",
      half: "half",
      custom: "custom",
    };

    const scholarshipTypeKey = String(body?.scholarshipType || "regular").trim().toLowerCase();
    const isNewStudent = Boolean(body?.isNewStudent);

    const payload: Record<string, any> = {
      is_new: isNewStudent,
      is_new_student: isNewStudent,
      student_type: isNewStudent ? "new" : "continuous",
      admission_term: body?.admissionTerm ?? null,
      admission_academic_year: body?.admissionAcademicYear ?? null,
      scholarship_type: scholarshipTypeMap[scholarshipTypeKey] || "none",
      scholarship_amount: scholarshipTypeKey === "custom" ? numberValue(body?.customScholarshipAmount) : 0,
      arrears: numberValue(body?.arrears),
    };

    const { data, error } = await supabaseAdmin
      .from("students")
      .update(payload)
      .eq("id", studentId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "FEES_SAVE_STUDENT_SETUP",
      className: data?.class_name ?? null,
      details: `Updated fee setup for ${data?.full_name || studentId} — type: ${payload.student_type}, scholarship: ${payload.scholarship_type}, arrears: GHS ${payload.arrears.toFixed(2)}.`,
    });

    return NextResponse.json({ message: "Student setup saved.", student: data, payload });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
