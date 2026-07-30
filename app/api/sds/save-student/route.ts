import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

// Fields the SDS admin UI is allowed to write on a student record. Anything
// outside this list is dropped, even if present in the request body.
const ALLOWED_FIELDS = [
  "full_name",
  "student_id",
  "gender",
  "date_of_birth",
  "age",
  "class_id",
  "class_name",
  "photo_url",

  "father_name",
  "father_phone",
  "father_address",

  "mother_name",
  "mother_phone",
  "mother_address",

  "stays_with",

  "guardian_name",
  "guardian_phone",
  "guardian_address",

  "emergency_contact",

  "health_condition",
  "disability_support",
  "health_note",

  "nhis_image_url",
  "weighing_card_url",
  "other_document_1_url",
  "other_document_2_url",
  "other_document_3_url",

  "status",
];

function sanitizePayload(input: Record<string, any>) {
  const clean: Record<string, any> = {};

  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      clean[field] = input[field];
    }
  }

  return clean;
}

// SDS (Student Data System) writes to `students` used to go straight from the
// browser's anon-key client, gated only by a client-side "userRole === admin"
// check that a scripted call could bypass entirely. This route backs that
// check with a real server-side role check before touching the database.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = body.id ? String(body.id).trim() : "";
    const payload = sanitizePayload(body.payload || {});

    const fullName = String(payload.full_name || "").trim();
    const className = String(payload.class_name || "").trim();

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    if (!className) {
      return NextResponse.json({ error: "Class is required." }, { status: 400 });
    }

    if (id) {
      const { data, error } = await supabaseAdmin
        .from("students")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      void logActivity({
        userName: actorName(auth.teacher),
        role: auth.role,
        action: "SDS_UPDATE_STUDENT",
        className: className || null,
        details: `Updated student record for "${fullName}" (${className}).`,
      });

      return NextResponse.json({ message: "Student updated successfully.", student: data });
    }

    const { data, error } = await supabaseAdmin
      .from("students")
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "SDS_ADD_STUDENT",
      className: className || null,
      details: `Added new student record for "${fullName}" (${className}).`,
    });

    return NextResponse.json({ message: "Student added successfully.", student: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
