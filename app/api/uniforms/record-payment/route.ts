import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

// Uniforms Record Payment used to write straight to Supabase from the
// browser (jsms_uniform_payments/jsms_uniform_payment_items/
// jsms_all_payment_logs/universal_receipts). Proxied through here so it can
// be replayed from the offline queue (lib/offline) and is authorized
// server-side, matching the Fees module's routes. The receipt-number
// counting + retry-on-duplicate logic is unchanged in spirit from the
// client version, just runs here — at the moment the write actually lands —
// instead of being precomputed before an offline write is even queued.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

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

function getLastFourStudentId(studentId: string) {
  const digitsOnly = cleanText(studentId).replace(/\D/g, "");
  if (digitsOnly.length < 4) throw new Error("Student ID must contain at least 4 numbers.");
  return digitsOnly.slice(-4);
}

function getTodayReceiptCode() {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${day}`;
}

function getDayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function isDuplicateReceiptError(error: any) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message || error.details || "").toLowerCase();
  return message.includes("duplicate") && message.includes("receipt");
}

async function generateReceiptNumber(studentId: string, attempt: number) {
  const lastFour = getLastFourStudentId(studentId);
  const today = getTodayReceiptCode();
  const { start, end } = getDayRange();
  const prefix = `JVSU/${today}/${lastFour}`;

  const { data } = await supabaseAdmin
    .from("jsms_uniform_payments")
    .select("receipt_number, created_at")
    .gte("created_at", start)
    .lte("created_at", end);

  const count =
    (data || []).filter((row: any) => cleanText(row.receipt_number).startsWith(prefix)).length + 1 + attempt;

  return `${prefix}/${String(count).padStart(2, "0")}`;
}

async function safeInsert(table: string, payload: Record<string, any>) {
  const result = await supabaseAdmin.from(table).insert(payload);
  if (result.error) console.error(`safeInsert(${table}) failed:`, result.error);
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const studentId = cleanText(body?.studentId);
    const studentName = cleanText(body?.studentName);
    const className = cleanText(body?.className);
    const selectedItems: Array<{ key?: string; label?: string; item_name?: string; price: number }> =
      Array.isArray(body?.selectedItems) ? body.selectedItems : [];
    const totalAmount = numberValue(body?.totalAmount);
    const amountPaid = numberValue(body?.amountPaid);
    const term = cleanText(body?.term);
    const academicYear = cleanText(body?.academicYear);
    const note = body?.note ? cleanText(body.note) : null;

    if (!studentId || !studentName || !className) {
      return NextResponse.json({ error: "Select a student first." }, { status: 400 });
    }

    if (selectedItems.length === 0) {
      return NextResponse.json({ error: "Select at least one uniform item." }, { status: 400 });
    }

    if (!(totalAmount > 0)) {
      return NextResponse.json({ error: "Selected uniform price is 0." }, { status: 400 });
    }

    if (amountPaid < 0 || amountPaid > totalAmount) {
      return NextResponse.json({ error: "Amount paid must be between 0 and the total." }, { status: 400 });
    }

    const staffName = getStaffDisplayName(auth.teacher);
    const balance = totalAmount - amountPaid;
    const paymentStatus = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    const itemNames = selectedItems.map((item) => item.label || item.item_name || "").join(", ");

    let paymentData: Record<string, any> | null = null;
    let receipt = "";
    let lastError: any = null;
    const MAX_ATTEMPTS = 4;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      receipt = await generateReceiptNumber(studentId, attempt);

      const { data, error } = await supabaseAdmin
        .from("jsms_uniform_payments")
        .insert({
          student_id: studentId,
          student_name: studentName,
          class_name: className,
          receipt_number: receipt,
          item_name: itemNames,
          quantity: selectedItems.length || 1,
          selected_items: selectedItems.map((item) => ({
            key: item.key,
            item_name: item.label || item.item_name,
            price: item.price,
            quantity: 1,
          })),
          total_amount: totalAmount,
          amount_paid: amountPaid,
          balance,
          payment_status: paymentStatus,
          receipt_issued_by: staffName,
          received_by: staffName,
          payment_note: note,
          term,
          academic_year: academicYear,
        })
        .select("*")
        .single();

      if (!error) {
        paymentData = data;
        break;
      }

      lastError = error;
      if (!isDuplicateReceiptError(error)) break;
    }

    if (!paymentData) {
      throw new Error(lastError?.message || "Could not record uniform payment.");
    }

    const itemsPayload = selectedItems.map((item) => ({
      payment_id: paymentData!.id,
      receipt_number: receipt,
      student_id: studentId,
      student_name: studentName,
      class_name: className,
      item_name: item.label || item.item_name,
      quantity: 1,
      unit_price: item.price,
      total_price: item.price,
    }));

    const { error: itemsError } = await supabaseAdmin.from("jsms_uniform_payment_items").insert(itemsPayload);
    if (itemsError) throw new Error(itemsError.message);

    await safeInsert("jsms_all_payment_logs", {
      receipt_number: receipt,
      student_id: studentId,
      student_name: studentName,
      class_name: className,
      module: "uniforms",
      item_name: itemNames,
      amount_paid: amountPaid,
      total_amount: totalAmount,
      balance,
      source_id: paymentData.id,
      source_table: "jsms_uniform_payments",
      received_by: staffName,
      term,
      academic_year: academicYear,
    });

    await safeInsert("universal_receipts", {
      receipt_number: receipt,
      student_id: studentId,
      student_name: studentName,
      class_name: className,
      module: "uniforms",
      item_name: itemNames,
      amount_paid: amountPaid,
      total_amount: totalAmount,
      balance,
      received_by: staffName,
      term,
      academic_year: academicYear,
    });

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "UNIFORMS_RECORD_PAYMENT",
      className,
      details: `Recorded GHS ${amountPaid.toFixed(2)} uniform payment (${itemNames}) for ${studentName} (${studentId}), receipt ${receipt}.`,
    });

    return NextResponse.json({ message: `Uniform payment recorded. Receipt: ${receipt}`, payment: paymentData });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
