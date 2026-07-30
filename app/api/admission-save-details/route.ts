import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

function text(value: unknown) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

// Staff-only: edits an applicant's full details record. Previously called via
// supabase.rpc(...) straight from the browser with no server-side role check
// at all.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const applicationId = String(body.application_id || "").trim();
    const studentName = text(body.student_name);
    const classApplying = text(body.class_applying);

    if (!applicationId) {
      return NextResponse.json({ error: "Application ID is required." }, { status: 400 });
    }
    if (!studentName) {
      return NextResponse.json({ error: "Student name is required." }, { status: 400 });
    }
    if (!classApplying) {
      return NextResponse.json({ error: "Class is required." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc("update_admission_application_details", {
      p_application_id: applicationId,
      p_student_name: studentName,
      p_class_applying: classApplying,
      p_gender: text(body.gender),
      p_date_of_birth: text(body.date_of_birth),
      p_place_of_birth: text(body.place_of_birth),
      p_hometown: text(body.hometown),
      p_nationality: text(body.nationality),
      p_religion: text(body.religion),
      p_address: text(body.address),
      p_previous_school: text(body.previous_school),
      p_reason_for_leaving: text(body.reason_for_leaving),
      p_nhis_number: text(body.nhis_number),
      p_medical_condition: text(body.medical_condition),
      p_allergies: text(body.allergies),
      p_blood_group: text(body.blood_group),
      p_father_name: text(body.father_name),
      p_father_address: text(body.father_address),
      p_father_phone: text(body.father_phone),
      p_father_occupation: text(body.father_occupation),
      p_mother_name: text(body.mother_name),
      p_mother_address: text(body.mother_address),
      p_mother_phone: text(body.mother_phone),
      p_mother_occupation: text(body.mother_occupation),
      p_stays_with: text(body.stays_with),
      p_guardian_name: text(body.guardian_name),
      p_guardian_address: text(body.guardian_address),
      p_guardian_phone: text(body.guardian_phone),
      p_guardian_relationship: text(body.guardian_relationship),
      p_photo_url: text(body.photo_url),
      p_nhis_card_url: text(body.nhis_card_url),
      p_weighing_card_url: text(body.weighing_card_url),
      p_birth_certificate_url: text(body.birth_certificate_url),
      p_document_1_url: text(body.document_1_url),
      p_document_2_url: text(body.document_2_url),
      p_document_3_url: text(body.document_3_url),
    });

    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "ADMISSION_SAVE_DETAILS",
      details: `Saved admission details for "${studentName}" (${classApplying}).`,
    });

    return NextResponse.json({ message: "Admission details saved." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
