import { supabaseAdmin } from "@/lib/supabase-admin";

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

export function getLastFourStudentId(studentId: string) {
  const digitsOnly = String(studentId || "").replace(/\D/g, "");
  if (digitsOnly.length < 4) throw new Error("Student ID must contain at least 4 numbers.");
  return digitsOnly.slice(-4);
}

async function generateBookReceiptNumber(studentId: string, attempt: number) {
  const code = getTodayReceiptCode();
  const lastFour = getLastFourStudentId(studentId);
  const { start, end } = getDayRange();

  const { count, error } = await supabaseAdmin
    .from("jsms_book_payments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .gte("created_at", start)
    .lte("created_at", end);

  if (error) throw new Error("Could not generate receipt number.");

  const nextCount = String(Number(count || 0) + 1 + attempt).padStart(2, "0");
  return `JVSB/${code}/${lastFour}/${nextCount}`;
}

function isDuplicateReceiptError(error: any) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message || error.details || "").toLowerCase();
  return message.includes("duplicate") && message.includes("receipt");
}

// Same counting-plus-retry approach the client used, just running here at
// the moment the write actually lands on the server (never precomputed
// before an offline write is queued — see app/api/books/record-payment).
export async function insertBookPaymentWithReceipt(studentId: string, payload: Record<string, any>) {
  const MAX_ATTEMPTS = 4;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const receiptNumber = await generateBookReceiptNumber(studentId, attempt);

    const { data, error } = await supabaseAdmin
      .from("jsms_book_payments")
      .insert({ ...payload, receipt_number: receiptNumber })
      .select("*")
      .single();

    if (!error) return data;

    lastError = error;
    if (!isDuplicateReceiptError(error)) throw new Error(error.message);
  }

  throw new Error(lastError?.message || "Could not record payment.");
}
