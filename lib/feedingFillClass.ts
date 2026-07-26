import { supabaseAdmin } from "@/lib/supabase-admin";

type Attendance = "present" | "absent";

function getStudentIdValue(row: Record<string, any>) {
  return String(row.student_id || row.studentId || row.id || "").trim();
}

function getClassName(row: Record<string, any>) {
  return String(row.class_name || row.className || row.name || "").trim();
}

// Mirrors calculateAdminFeeding() in fill-class/page.tsx.
export function calculateAdminFeeding(params: {
  previousBalance: number;
  amountPaidToday: number;
  attendance: Attendance;
  feedingFee: number;
  minimumToEat: number;
  ateWithoutPay: boolean;
}) {
  const { previousBalance, amountPaidToday, attendance, feedingFee, minimumToEat, ateWithoutPay } = params;
  const availableBeforeMeal = Number(previousBalance) + Number(amountPaidToday);

  if (attendance === "absent") {
    return { availableBeforeMeal, ateToday: false, newBalance: availableBeforeMeal };
  }

  const qualifiesNormally = availableBeforeMeal >= minimumToEat;
  const ateToday = ateWithoutPay || qualifiesNormally;
  const newBalance = ateToday ? availableBeforeMeal - feedingFee : availableBeforeMeal;

  return { availableBeforeMeal, ateToday, newBalance };
}

// Mirrors the "previousBalance as of the day before selectedDate" lookup in
// loadClassData() — reading the ledger's latest entry strictly before the
// date (scoped to academic year) makes re-saving the same date idempotent
// instead of double-deducting off an already-post-deduction balance.
export async function getPreviousBalances(studentIds: string[], academicYear: string, date: string) {
  if (studentIds.length === 0) return new Map<string, number>();

  const { data, error } = await supabaseAdmin
    .from("balance_ledger")
    .select("student_id, date, new_balance, academic_year")
    .in("student_id", studentIds)
    .eq("academic_year", academicYear)
    .lt("date", date)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);

  const balances = new Map<string, number>();
  (data || []).forEach((row: any) => {
    const sid = String(row.student_id || "").trim();
    if (!sid) return;
    // Rows arrive oldest -> newest, so the last write per student wins.
    balances.set(sid, Number(row.new_balance ?? 0));
  });

  return balances;
}

// Mirrors rebuildStudentBalancesFromLedger() — scoped to the academic year
// so a new year starts every student at zero rather than an old year's
// ledger history silently continuing to drive today's balance forever.
export async function rebuildStudentBalancesFromLedger(academicYear: string) {
  const { data, error } = await supabaseAdmin
    .from("balance_ledger")
    .select("*")
    .eq("academic_year", academicYear)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);

  const latestByStudent = new Map<string, Record<string, any>>();
  (data || []).forEach((row: any) => {
    const studentId = getStudentIdValue(row);
    if (!studentId) return;
    latestByStudent.set(studentId, row);
  });

  const payload = Array.from(latestByStudent.values()).map((row) => ({
    student_id: getStudentIdValue(row),
    student_name: String(row.student_name || row.studentName || ""),
    class_name: getClassName(row),
    academic_year: String(row.academic_year || row.academicYear || ""),
    balance: Number(row.new_balance || row.newBalance || 0),
    updated_at: new Date().toISOString(),
  }));

  if (payload.length === 0) return;

  const { error: upsertError } = await supabaseAdmin
    .from("student_balances")
    .upsert(payload, { onConflict: "student_id" });

  if (upsertError) throw new Error(upsertError.message);
}
