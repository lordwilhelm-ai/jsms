import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { verifyStaffPin } from "@/lib/verifyStaffPin";
import { deleteRecordRow, recalculateFeePaymentChain, RECORD_TYPES } from "@/lib/recordManagement";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function PATCH(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { type, id } = await params;
    const config = RECORD_TYPES[type];
    if (!config) {
      return NextResponse.json({ error: `Unknown record type "${type}".` }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const pin = cleanText(body?.pin);
    const changes: Record<string, any> = body?.changes && typeof body.changes === "object" ? body.changes : {};

    const pinCheck = await verifyStaffPin(auth.teacher.id, pin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error, code: pinCheck.code }, { status: pinCheck.status });
    }

    const editableKeys = new Set(config.fields.filter((f) => f.editable).map((f) => f.key));
    const updatePayload: Record<string, any> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (!editableKeys.has(key)) continue;
      const field = config.fields.find((f) => f.key === key);
      updatePayload[key] = field?.type === "number" ? Number(value) || 0 : value;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: "No editable fields were changed." }, { status: 400 });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from(config.table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin.from(config.table).update(updatePayload).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    // fee_payments' cumulative_paid/balance_after_payment are a running
    // snapshot per student+term+year — recompute the chain for whichever
    // student/term/year this row belonged to BEFORE the edit, and again for
    // whichever it belongs to AFTER (only different if student/term/year
    // itself was part of the edit).
    if (config.isFeePayment) {
      await recalculateFeePaymentChain(before.student_id, before.academic_year, before.term);

      const afterStudentId = updatePayload.student_id ?? before.student_id;
      const afterYear = updatePayload.academic_year ?? before.academic_year;
      const afterTerm = updatePayload.term ?? before.term;
      if (afterStudentId !== before.student_id || afterYear !== before.academic_year || afterTerm !== before.term) {
        await recalculateFeePaymentChain(afterStudentId, afterYear, afterTerm);
      }
    }

    const staffName = actorName(auth.teacher);
    const changeSummary = Object.keys(updatePayload)
      .map((key) => `${key}: "${before[key] ?? ""}" → "${updatePayload[key]}"`)
      .join(", ");

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "RECORD_EDIT",
      className: cleanText(before.class_name) || null,
      details: `Edited ${config.label} record (${config.table}#${id}): ${changeSummary}.`,
    });

    return NextResponse.json({ message: "Record updated." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const { type, id } = await params;
    const config = RECORD_TYPES[type];
    if (!config) {
      return NextResponse.json({ error: `Unknown record type "${type}".` }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const pin = cleanText(body?.pin);

    const pinCheck = await verifyStaffPin(auth.teacher.id, pin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error, code: pinCheck.code }, { status: pinCheck.status });
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from(config.table)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) {
      return NextResponse.json({ error: "Record not found." }, { status: 404 });
    }

    await deleteRecordRow(type, id);

    const staffName = actorName(auth.teacher);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "RECORD_DELETE",
      className: cleanText(before.class_name) || null,
      details: `Deleted ${config.label} record (${config.table}#${id}) via Manage Records.`,
    });

    return NextResponse.json({ message: "Record deleted." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Something went wrong." },
      { status: 500 }
    );
  }
}
