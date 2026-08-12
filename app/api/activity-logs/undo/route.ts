import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { comparePin, isValidPin } from "@/lib/kiosk/pin";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

// Deletes one row (and, if given, its child rows) — used for every
// "undo" that's a single insert with no dependent running-balance chain:
// feeding money received, uniform/book payments, income & expenditure
// entries.
async function undoDeleteRow(payload: Record<string, any>) {
  const table = cleanText(payload?.table);
  const id = cleanText(payload?.id);
  if (!table || !id) throw new Error("Malformed undo payload.");

  if (payload?.childTable && payload?.childKey) {
    const { error: childError } = await supabaseAdmin
      .from(cleanText(payload.childTable))
      .delete()
      .eq(cleanText(payload.childKey), id);
    if (childError) throw new Error(childError.message);
  }

  const { error } = await supabaseAdmin.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Fee payments store a running cumulative_paid/balance_after_payment
// snapshot ON EACH ROW, computed from every earlier payment for that
// student+term+year at the moment it was saved (see
// app/api/fees/record-payment/route.ts) — so deleting one isn't enough on
// its own; every LATER payment in that same student/term/year has a
// cumulative_paid that already includes the deleted amount and would go
// stale. This deletes the row, then replays the remaining payments in
// chronological order to recompute cumulative_paid/balance_after_payment
// on each of them, exactly like a fresh insert would have.
async function undoDeleteFeePayment(payload: Record<string, any>) {
  const id = cleanText(payload?.id);
  const studentCode = cleanText(payload?.studentCode);
  const academicYear = cleanText(payload?.academicYear);
  const term = cleanText(payload?.term);
  if (!id || !studentCode || !academicYear || !term) {
    throw new Error("Malformed undo payload.");
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("fee_payments")
    .select("total_fee")
    .eq("id", id)
    .maybeSingle();
  if (targetError) throw new Error(targetError.message);
  if (!target) return; // already gone

  const { error: deleteError } = await supabaseAdmin.from("fee_payments").delete().eq("id", id);
  if (deleteError) throw new Error(deleteError.message);

  const { data: remaining, error: remainingError } = await supabaseAdmin
    .from("fee_payments")
    .select("id, amount_paid, total_fee, created_at")
    .eq("student_id", studentCode)
    .eq("academic_year", academicYear)
    .eq("term", term)
    .order("created_at", { ascending: true });
  if (remainingError) throw new Error(remainingError.message);

  let cumulative = 0;
  for (const row of remaining || []) {
    cumulative += Number(row.amount_paid || 0);
    const totalFee = Number(row.total_fee ?? target.total_fee ?? 0);
    const balance = Math.max(totalFee - cumulative, 0);

    const { error: updateError } = await supabaseAdmin
      .from("fee_payments")
      .update({ cumulative_paid: cumulative, balance_after_payment: balance })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json().catch(() => ({}));
    const logId = cleanText(body?.logId);
    const pin = cleanText(body?.pin);

    if (!logId) {
      return NextResponse.json({ error: "Log entry id is required." }, { status: 400 });
    }

    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "Enter your 4-digit PIN." }, { status: 400 });
    }

    const { data: caller, error: callerError } = await supabaseAdmin
      .from("teachers")
      .select("pin_hash")
      .eq("id", auth.teacher.id)
      .maybeSingle();
    if (callerError) throw new Error(callerError.message);

    if (!caller?.pin_hash) {
      return NextResponse.json(
        { error: "You haven't set a PIN yet.", code: "NO_PIN_SET" },
        { status: 400 }
      );
    }

    const pinOk = await comparePin(pin, caller.pin_hash);
    if (!pinOk) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 403 });
    }

    const { data: log, error: logError } = await supabaseAdmin
      .from("activity_logs")
      .select("*")
      .eq("id", logId)
      .maybeSingle();
    if (logError) throw new Error(logError.message);
    if (!log) {
      return NextResponse.json({ error: "Activity log entry not found." }, { status: 404 });
    }
    if (log.undone_at) {
      return NextResponse.json({ error: "This entry has already been undone." }, { status: 409 });
    }
    if (!log.undo_type) {
      return NextResponse.json({ error: "This entry can't be undone." }, { status: 400 });
    }

    const payload = log.undo_payload || {};

    switch (log.undo_type) {
      case "DELETE_ROW":
        await undoDeleteRow(payload);
        break;
      case "DELETE_FEE_PAYMENT":
        await undoDeleteFeePayment(payload);
        break;
      default:
        return NextResponse.json({ error: `Unknown undo type "${log.undo_type}".` }, { status: 400 });
    }

    const staffName = actorName(auth.teacher);

    const { error: markError } = await supabaseAdmin
      .from("activity_logs")
      .update({ undone_at: new Date().toISOString(), undone_by: staffName })
      .eq("id", logId);
    if (markError) throw new Error(markError.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "ACTIVITY_LOG_UNDO",
      className: log.class_name ?? null,
      details: `Undid "${log.action}" originally recorded by ${log.user_name}: ${log.details}`,
    });

    return NextResponse.json({ message: "Undone successfully." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
