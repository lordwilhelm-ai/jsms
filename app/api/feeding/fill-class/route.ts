import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { calculateAdminFeeding, getPreviousBalances, rebuildStudentBalancesFromLedger } from "@/lib/feedingFillClass";
import { logActivity } from "@/lib/activityLog";

// "Fill for Class" used to compute previousBalance/newBalance client-side
// (from data fetched at page-load time), then delete-and-reinsert
// daily_entries/balance_ledger and rebuild student_balances from the whole
// academic year's ledger — all direct-client. That's a harder offline case
// than Books' stock problem: baking a computed previousBalance into a
// queued write risks overwriting a legitimately newer balance if anything
// else touched that student's ledger while the write sat queued. So this
// route accepts only the RAW admin inputs (attendance / amount paid / ate-
// without-pay per student) and does every fresh read + the delete/insert +
// the ledger rebuild here, atomically, at the moment the write actually
// lands — whether that's instantly online or replayed from the offline
// queue later.
const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function getStaffDisplayName(teacher: Record<string, any> | null) {
  return (
    String(
      teacher?.full_name || teacher?.name || teacher?.teacher_name || teacher?.username || teacher?.email || "Admin"
    ).trim() || "Admin"
  );
}

type RawEntry = {
  studentId: string;
  studentName: string;
  className: string;
  attendance: "present" | "absent";
  amountPaidToday: number;
  ateWithoutPay: boolean;
};

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const date = cleanText(body?.date);
    const className = cleanText(body?.className);
    const academicYear = cleanText(body?.academicYear);
    const feedingFee = Number(body?.feedingFee) || 0;
    const minimumToEat = Number(body?.minimumToEat) || 0;
    const assignedTeacherName = cleanText(body?.assignedTeacherName) || "Not Assigned";
    const entries: RawEntry[] = Array.isArray(body?.entries) ? body.entries : [];

    if (!date || !className) {
      return NextResponse.json({ error: "Date and class are required." }, { status: 400 });
    }

    if (entries.length === 0) {
      return NextResponse.json({ error: "No students to save." }, { status: 400 });
    }

    const staffName = getStaffDisplayName(auth.teacher);

    // Re-check the school-closure block server-side too — a device that
    // queued this offline before a closure was added shouldn't silently
    // bypass it just because the client-side check was stale.
    const { data: closures, error: closuresError } = await supabaseAdmin
      .from("school_closures")
      .select("*");
    if (closuresError) throw new Error(closuresError.message);

    const blockedClosure = (closures || []).find((closure: any) => {
      if (!(closure.active ?? true)) return false;
      const start = cleanText(closure.start_date || closure.startDate);
      const end = cleanText(closure.end_date || closure.endDate);
      if (!start || !end) return false;
      return date >= start && date <= end;
    });

    if (blockedClosure) {
      return NextResponse.json(
        { error: `Cannot save entry. School is closed for: ${cleanText(blockedClosure.name)} (${cleanText(blockedClosure.type)})` },
        { status: 400 }
      );
    }

    const studentIds = entries.map((entry) => cleanText(entry.studentId)).filter(Boolean);
    const previousBalances = await getPreviousBalances(studentIds, academicYear, date);

    const rows = entries.map((entry) => {
      const studentId = cleanText(entry.studentId);
      const previousBalance = previousBalances.get(studentId) || 0;

      const result = calculateAdminFeeding({
        previousBalance,
        amountPaidToday: Number(entry.amountPaidToday) || 0,
        attendance: entry.attendance === "absent" ? "absent" : "present",
        feedingFee,
        minimumToEat,
        ateWithoutPay: Boolean(entry.ateWithoutPay),
      });

      return {
        studentId,
        studentName: cleanText(entry.studentName),
        className: cleanText(entry.className) || className,
        attendance: entry.attendance === "absent" ? "absent" : "present",
        amountPaidToday: Number(entry.amountPaidToday) || 0,
        ateWithoutPay: Boolean(entry.ateWithoutPay),
        previousBalance,
        ...result,
      };
    });

    const { data: existingDailyRows, error: existingDailyError } = await supabaseAdmin
      .from("daily_entries")
      .select("id")
      .eq("date", date)
      .eq("class_name", className);
    if (existingDailyError) throw new Error(existingDailyError.message);

    const { data: existingLedgerRows, error: existingLedgerError } = await supabaseAdmin
      .from("balance_ledger")
      .select("id")
      .eq("date", date)
      .eq("class_name", className);
    if (existingLedgerError) throw new Error(existingLedgerError.message);

    if ((existingDailyRows || []).length > 0) {
      const { error } = await supabaseAdmin
        .from("daily_entries")
        .delete()
        .in("id", (existingDailyRows || []).map((row: any) => row.id));
      if (error) throw new Error(error.message);
    }

    if ((existingLedgerRows || []).length > 0) {
      const { error } = await supabaseAdmin
        .from("balance_ledger")
        .delete()
        .in("id", (existingLedgerRows || []).map((row: any) => row.id));
      if (error) throw new Error(error.message);
    }

    const now = new Date().toISOString();

    const dailyPayload = rows.map((row) => ({
      date,
      academic_year: academicYear,
      class_name: className,
      student_id: row.studentId,
      student_name: row.studentName,
      attendance: row.attendance,
      amount_paid_today: row.amountPaidToday,
      previous_balance: row.previousBalance,
      available_before_meal: row.availableBeforeMeal,
      ate_today: row.ateToday,
      admin_override_ate_without_pay: row.ateWithoutPay,
      new_balance: row.newBalance,
      assigned_teacher_name: assignedTeacherName,
      entered_by_name: staffName,
      entered_by_role: "admin",
      created_at: now,
    }));

    const { error: dailyInsertError } = await supabaseAdmin.from("daily_entries").insert(dailyPayload);
    if (dailyInsertError) throw new Error(dailyInsertError.message);

    const ledgerPayload = rows.map((row) => ({
      date,
      academic_year: academicYear,
      student_id: row.studentId,
      student_name: row.studentName,
      class_name: row.className,
      amount_paid_today: row.amountPaidToday,
      previous_balance: row.previousBalance,
      attendance: row.attendance,
      ate_today: row.ateToday,
      admin_override_ate_without_pay: row.ateWithoutPay,
      new_balance: row.newBalance,
      assigned_teacher_name: assignedTeacherName,
      edited_by: staffName,
      feeding_fee: feedingFee,
      minimum_to_eat: minimumToEat,
      created_at: now,
    }));

    const { error: ledgerInsertError } = await supabaseAdmin.from("balance_ledger").insert(ledgerPayload);
    if (ledgerInsertError) throw new Error(ledgerInsertError.message);

    const presentCount = rows.filter((row) => row.attendance === "present").length;
    const absentCount = rows.filter((row) => row.attendance === "absent").length;
    const eatingCount = rows.filter((row) => row.ateToday).length;
    const ateWithoutPayCount = rows.filter((row) => row.ateWithoutPay).length;
    const totalCollected = rows.reduce((sum, row) => sum + row.amountPaidToday, 0);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "FEEDING_FILL_CLASS",
      className,
      date,
      details: `Filled ${className} for ${date} — ${presentCount} present, ${absentCount} absent, GHS ${totalCollected.toFixed(2)} collected, ${ateWithoutPayCount} ate without pay.`,
    });

    await rebuildStudentBalancesFromLedger(academicYear);

    return NextResponse.json({
      message: "Class entry saved and balances rebuilt successfully.",
      summary: { presentCount, absentCount, eatingCount, ateWithoutPayCount, totalCollected },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
