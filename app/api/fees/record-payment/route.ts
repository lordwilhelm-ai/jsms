import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";
import { isStudentActive } from "@/lib/studentStatus";

// Record Payment used to insert into `fee_payments` straight from the
// anon-key browser client, gated only by a client-side "redirect if teacher"
// check. This proxies the insert through the service role behind
// requireStaffRole(), and resolves the receipt sequence number + "entered
// by"/"recorded by" fields server-side (from the authenticated staff
// session) instead of trusting client input or hardcoding "Admin".
//
// totalOwed/totalPaidBefore are likewise recomputed here from a fresh read
// of `students`/`classes`/`fee_payments` rather than trusted from the
// request body — a payment that sat in an offline queue for a while (or
// raced another payment recorded elsewhere) must land against the REAL
// current balance, not whatever the client happened to compute before it
// went offline. `amount` (what the cashier actually collected) is the only
// money figure still taken from the client, since that's just data entry.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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

function getStudentIdValue(row: Record<string, any>) {
  return cleanText(row.student_id || row.jvs_id || row.studentId);
}

function getClassName(row: Record<string, any>) {
  return cleanText(row.class_name || row.className || row.name);
}

// Mirrors getEffectiveStudentType() in fees/admin/record-payment/page.tsx —
// a student is only "new" for fee purposes in the same term/year they
// actually joined; every term after that they're billed as continuing.
function getEffectiveStudentType(student: Record<string, any>, currentTerm: string, academicYear: string) {
  const rawType = cleanText(student.student_type).toLowerCase();
  const markedNew = rawType === "new" || student.is_new === true || student.is_new_student === true;
  if (!markedNew) return "continuous";

  const admissionTerm = cleanText(student.admission_term);
  const admissionYear = cleanText(student.admission_academic_year);

  if (admissionTerm && admissionYear && currentTerm && academicYear) {
    return admissionTerm === currentTerm && admissionYear === academicYear ? "new" : "continuous";
  }

  return "new";
}

// Mirrors computeTotals() in the same page — base fee (returning vs new)
// adjusted by scholarship type, plus arrears.
function computeTotalOwed(student: Record<string, any>, classRow: Record<string, any> | null, currentTerm: string, academicYear: string) {
  const studentType = getEffectiveStudentType(student, currentTerm, academicYear);
  const continuousFee = numberValue(classRow?.fee_returning);
  const newFee = numberValue(classRow?.fee_new);

  let baseFee = studentType === "new" ? newFee : continuousFee;

  const scholarshipType = cleanText(student.scholarship_type).toLowerCase();
  if (scholarshipType === "full") baseFee = 0;
  if (scholarshipType === "half") baseFee = baseFee / 2;
  if (scholarshipType === "custom") baseFee = numberValue(student.scholarship_amount);

  const arrears = numberValue(student.arrears);
  return baseFee + arrears;
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const studentDbId = cleanText(body?.studentDbId);
    const studentIdValue = cleanText(body?.studentIdValue);
    const studentName = cleanText(body?.studentName) || "-";
    const classNameValue = cleanText(body?.classNameValue);
    const academicYear = cleanText(body?.academicYear);
    const term = cleanText(body?.term);
    const amount = numberValue(body?.amount);
    const paymentMethod = cleanText(body?.paymentMethod) || "cash";
    const notes = body?.notes ? cleanText(body.notes) : null;

    if (!studentIdValue) {
      return NextResponse.json({ error: "Student ID is required." }, { status: 400 });
    }

    if (!(amount > 0)) {
      return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });
    }

    // Resolve the live student + class rows instead of trusting client-sent
    // totals. Two separate .eq() lookups (not a raw .or() filter string)
    // since studentDbId/studentIdValue both ultimately come from client input.
    const [byDbId, byStudentId] = await Promise.all([
      studentDbId
        ? supabaseAdmin.from("students").select("*").eq("id", studentDbId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin.from("students").select("*").eq("student_id", studentIdValue).maybeSingle(),
    ]);

    if (byDbId.error) throw new Error(byDbId.error.message);
    if (byStudentId.error) throw new Error(byStudentId.error.message);

    const student = byDbId.data || byStudentId.data;

    if (!student) {
      return NextResponse.json({ error: "Student record not found." }, { status: 404 });
    }

    if (!isStudentActive(student)) {
      return NextResponse.json(
        { error: "This student is marked inactive and cannot receive new fee payments." },
        { status: 400 }
      );
    }

    const { data: classRows, error: classError } = await supabaseAdmin.from("classes").select("*");
    if (classError) throw new Error(classError.message);

    const classRow =
      (classRows || []).find((row) => getClassName(row) === classNameValue) ||
      (classRows || []).find((row) => getClassName(row) === getClassName(student)) ||
      null;

    const { data: existingPayments, error: paymentsError } = await supabaseAdmin
      .from("fee_payments")
      .select("id, student_id, amount_paid, academic_year, term")
      .eq("academic_year", academicYear)
      .eq("term", term);

    if (paymentsError) throw new Error(paymentsError.message);

    const resolvedStudentIdValue = getStudentIdValue(student) || studentIdValue;

    const matchingPayments = (existingPayments || []).filter((row) => {
      const rowStudentId = cleanText(row.student_id);
      return rowStudentId === resolvedStudentIdValue || rowStudentId === cleanText(student.id);
    });

    const totalPaidBefore = matchingPayments.reduce((sum, row) => sum + numberValue(row.amount_paid), 0);
    const totalOwed = computeTotalOwed(student, classRow, term, academicYear);

    const previousPaymentCount = matchingPayments.length;

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const dd = String(now.getDate()).padStart(2, "0");
    const last4 = getLast4FromStudentId(resolvedStudentIdValue);
    const nextPaymentNumber = String(previousPaymentCount + 1).padStart(2, "0");
    const receiptNo = `JVSF/${yy}${dd}/${last4}/${nextPaymentNumber}`;

    const paymentDate = now.toISOString().slice(0, 10);
    const cumulativePaid = totalPaidBefore + amount;
    const outstandingBalance = Math.max(totalOwed - cumulativePaid, 0);
    const staffName = getStaffDisplayName(auth.teacher);

    const payload = {
      receipt_no: receiptNo,
      student_id: resolvedStudentIdValue,
      student_name: studentName || cleanText(student.full_name) || "-",
      class_name: classNameValue || getClassName(student),
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

    const { data: insertedPayment, error } = await supabaseAdmin
      .from("fee_payments")
      .insert([payload])
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "FEES_RECORD_PAYMENT",
      className: payload.class_name,
      date: paymentDate,
      details: `Recorded GHS ${amount.toFixed(2)} fee payment for ${payload.student_name} (${resolvedStudentIdValue}), receipt ${receiptNo}.`,
      undoType: "DELETE_RECORD",
      undoPayload: { recordType: "fees", id: insertedPayment.id },
    });

    return NextResponse.json({ message: `Payment recorded successfully. Receipt: ${receiptNo}`, payment: payload });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
