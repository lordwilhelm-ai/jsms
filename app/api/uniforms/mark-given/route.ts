import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function getStaffDisplayName(teacher: Record<string, any> | null) {
  return (
    String(
      teacher?.full_name || teacher?.name || teacher?.teacher_name || teacher?.username || teacher?.email || "Staff"
    ).trim() || "Staff"
  );
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const paymentId = cleanText(body?.paymentId);
    const receiptNumber = cleanText(body?.receiptNumber);
    const studentId = cleanText(body?.studentId);
    const studentName = cleanText(body?.studentName);
    const className = cleanText(body?.className);
    const itemNames: string[] = Array.isArray(body?.itemNames) ? body.itemNames.map(cleanText) : [];
    const note = body?.note ? cleanText(body.note) : null;

    if (!paymentId) {
      return NextResponse.json({ error: "Select a payment receipt first." }, { status: 400 });
    }

    if (itemNames.length === 0) {
      return NextResponse.json({ error: "Select at least one uniform item to mark as given." }, { status: 400 });
    }

    const staffName = getStaffDisplayName(auth.teacher);
    const now = new Date().toISOString();

    const payload = itemNames.map((itemName) => ({
      payment_id: paymentId,
      receipt_number: receiptNumber,
      student_id: studentId,
      student_name: studentName,
      class_name: className,
      item_name: itemName,
      quantity_given: 1,
      given_by: staffName,
      given_at: now,
      note,
    }));

    const { error } = await supabaseAdmin.from("jsms_uniforms_given").insert(payload);
    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Uniform item(s) marked as given." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
