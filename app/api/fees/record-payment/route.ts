import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

// Record Payment used to insert into `fee_payments` straight from the
// anon-key browser client, gated only by a client-side "redirect if teacher"
// check. This proxies the insert through the service role behind
// requireStaffRole(), and resolves the receipt sequence number + "entered
// by"/"recorded by" fields server-side (from the authenticated staff
// session) instead of trusting client input or hardcoding "Admin".
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getLast4FromStudentId(studentId: string) {
  const digits = studentId.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return studentId.slice(-4).padStart(4, "0");
}

function getStaffDisplayName(teacher: Record<string, any> | null) {
  return String(
    teacher?.full_name || teacher?.name || teacher?.teacher_name || teacher?.username || teacher?.email || "Staff"
  ).trim() || "Staff";
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const studentIdValue = String(body?.studentIdValue || "").trim();
    const studentName = String(body?.studentName || "-").trim();
    const classNameValue = String(body?.classNameValue || "").trim();
    const academicYear = String(body?.academicYear || "").trim();
    const term = String(body?.term || "").trim();
    const totalOwed = numberValue(body?.totalOwed);
    const totalPaidBefore = numberValue(body?.totalPaidBefore);
    const amount = numberValue(body?.amount);
    const paymentMethod = String(body?.paymentMethod || "cash").trim();
    const notes = body?.notes ? String(body.notes).trim() : null;

    if (!studentIdValue) {
      return NextResponse.json({ error: "Student ID is required." }, { status: 400 });
    }

    if (!(amount > 0)) {
      return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });
    }

    const { count: previousPaymentCount, error: countError } = await supabaseAdmin
      .from("fee_payments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentIdValue);

    if (countError) throw new Error(countError.message);

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const dd = String(now.getDate()).padStart(2, "0");
    const last4 = getLast4FromStudentId(studentIdValue);
    const nextPaymentNumber = String((previousPaymentCount || 0) + 1).padStart(2, "0");
    const receiptNo = `JVSF/${yy}${dd}/${last4}/${nextPaymentNumber}`;

    const paymentDate = now.toISOString().slice(0, 10);
    const cumulativePaid = totalPaidBefore + amount;
    const outstandingBalance = Math.max(totalOwed - cumulativePaid, 0);
    const staffName = getStaffDisplayName(auth.teacher);

    const payload = {
      receipt_no: receiptNo,
      student_id: studentIdValue,
      student_name: studentName,
      class_name: classNameValue,
      academic_year: academicYear,
      term,
      payment_type: "fees",
      total_fee: totalOwed,
      amount_paid: amount,
      cumulative_paid: cumulativePaid,
      balance_after_payment: outstandingBalance,
      payment_method: paymentMethod,
      method: paymentMethod,
      payment_date: paymentDate,
      entered_by: staffName,
      recorded_by: staffName,
      note: notes,
      notes,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { error } = await supabaseAdmin.from("fee_payments").insert([payload]);
    if (error) throw new Error(error.message);

    return NextResponse.json({ message: `Payment recorded successfully. Receipt: ${receiptNo}`, payment: payload });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
