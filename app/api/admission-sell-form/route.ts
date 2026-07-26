import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// Staff-only: records an in-person admission form sale. Same unguarded
// supabase.rpc(...) gap as the other admission admin actions, closed the
// same way for consistency.
export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, ["owner", "admin", "headmaster"]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const studentName = String(body.student_name || "").trim();
    const classApplying = String(body.class_applying || "").trim();

    if (!studentName) {
      return NextResponse.json({ error: "Student name is required." }, { status: 400 });
    }
    if (!classApplying) {
      return NextResponse.json({ error: "Class applying for is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("create_admission_form_purchase", {
      p_student_name: studentName,
      p_class_applying: classApplying,
      p_amount: body.amount !== undefined && body.amount !== null && body.amount !== "" ? Number(body.amount) : null,
      p_payment_method: String(body.payment_method || "cash"),
      p_payer_name: body.payer_name ? String(body.payer_name) : null,
      p_payer_phone: body.payer_phone ? String(body.payer_phone) : null,
      p_created_by_user_id: auth.teacher.id || null,
      p_created_by_name: auth.teacher.full_name || auth.teacher.username || "Admin",
    });

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      message: "Form saved.",
      receiptNumber: row?.receipt_number || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
