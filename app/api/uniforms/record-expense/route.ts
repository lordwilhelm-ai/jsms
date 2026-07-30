import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

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

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();

    const itemName = cleanText(body?.itemName);
    const quantity = numberValue(body?.quantity);
    const unitCost = numberValue(body?.unitCost);
    const totalCost = quantity * unitCost;

    if (!itemName) return NextResponse.json({ error: "Enter the item or work name." }, { status: 400 });
    if (!(quantity > 0)) return NextResponse.json({ error: "Quantity must be more than 0." }, { status: 400 });
    if (unitCost < 0) return NextResponse.json({ error: "Unit cost cannot be negative." }, { status: 400 });
    if (!(totalCost > 0)) return NextResponse.json({ error: "Total expense must be more than 0." }, { status: 400 });

    const staffName = getStaffDisplayName(auth.teacher);

    const payload = {
      expense_type: cleanText(body?.expenseType),
      item_name: itemName,
      quantity,
      unit: cleanText(body?.unit),
      unit_cost: unitCost,
      total_cost: totalCost,
      supplier_name: cleanText(body?.supplierName),
      receipt_number: cleanText(body?.receiptNumber),
      paid_by: staffName,
      expense_date: new Date().toISOString(),
      note: cleanText(body?.note),
      term: cleanText(body?.term),
      academic_year: cleanText(body?.academicYear),
    };

    const { error } = await supabaseAdmin.from("jsms_uniform_expenses").insert(payload);
    if (error) throw new Error(error.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "UNIFORMS_RECORD_EXPENSE",
      details: `Recorded uniform expense: ${itemName} x${quantity} @ GHS ${unitCost.toFixed(2)} — total GHS ${totalCost.toFixed(2)}.`,
    });

    return NextResponse.json({ message: "Uniform expense recorded. Profit has been recalculated." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
