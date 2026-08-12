import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity } from "@/lib/activityLog";

// Income & Expenditure used to write straight to `finance_transactions`/
// `finance_items` from the anon-key browser client. Proxied through here so
// it can be replayed from the offline queue (lib/offline) the same way an
// online save would go — and so it's authorized server-side, matching the
// Fees module's routes rather than being the one module left on the old
// direct-write pattern.
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

async function ensureFinanceItem(type: "income" | "expense", category: string, itemName: string) {
  const cleanName = cleanText(itemName);
  if (!cleanName) return;

  const { data: existing, error: findError } = await supabaseAdmin
    .from("finance_items")
    .select("id")
    .eq("type", type)
    .eq("category", category)
    .ilike("item_name", cleanName)
    .maybeSingle();

  if (findError) throw new Error(findError.message);
  if (existing) return;

  const { error } = await supabaseAdmin.from("finance_items").insert({
    type,
    category,
    item_name: cleanName,
  });

  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const type = cleanText(body?.type).toLowerCase();
    const amount = numberValue(body?.amount);
    const staffName = getStaffDisplayName(auth.teacher);

    if (!(amount > 0)) {
      return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
    }

    let payload: Record<string, any>;

    if (type === "income") {
      const category = cleanText(body?.category);
      const itemName = cleanText(body?.itemName);
      const location = cleanText(body?.location);

      if (!itemName) return NextResponse.json({ error: "Enter or select an income item." }, { status: 400 });

      await ensureFinanceItem("income", category, itemName);

      payload = {
        type: "income",
        category,
        item_name: itemName,
        amount,
        money_location: location,
        from_location: null,
        to_location: null,
        transaction_date: cleanText(body?.transactionDate),
        description: cleanText(body?.description) || null,
        recorded_by: staffName,
      };
    } else if (type === "expense") {
      const category = cleanText(body?.category);
      const itemName = cleanText(body?.itemName);
      const location = cleanText(body?.location);

      if (!itemName) return NextResponse.json({ error: "Enter or select an expenditure item." }, { status: 400 });

      await ensureFinanceItem("expense", category, itemName);

      payload = {
        type: "expense",
        category,
        item_name: itemName,
        amount,
        money_location: location,
        from_location: null,
        to_location: null,
        transaction_date: cleanText(body?.transactionDate),
        description: cleanText(body?.description) || null,
        recorded_by: staffName,
      };
    } else if (type === "salary") {
      const teacherName = cleanText(body?.teacherName);
      const salaryMonth = cleanText(body?.salaryMonth);
      const location = cleanText(body?.location);

      if (!teacherName) return NextResponse.json({ error: "Select the teacher receiving salary." }, { status: 400 });
      if (!salaryMonth) return NextResponse.json({ error: "Select the salary month." }, { status: 400 });

      await ensureFinanceItem("expense", "Salary", "Teacher Salary");

      const monthLabel = new Date(`${salaryMonth}-01T00:00:00`).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });

      const extraDescription = cleanText(body?.description);

      payload = {
        type: "expense",
        category: "Salary",
        item_name: `Salary - ${teacherName}`,
        amount,
        money_location: location,
        from_location: null,
        to_location: null,
        transaction_date: cleanText(body?.transactionDate),
        description:
          `Salary payment for ${teacherName} - ${monthLabel}` + (extraDescription ? ` | ${extraDescription}` : ""),
        recorded_by: staffName,
      };
    } else if (type === "transfer") {
      const fromLocation = cleanText(body?.fromLocation);
      const toLocation = cleanText(body?.toLocation);

      if (!fromLocation || !toLocation) {
        return NextResponse.json({ error: "Select transfer source and destination." }, { status: 400 });
      }

      if (fromLocation === toLocation) {
        return NextResponse.json(
          { error: "Transfer source and destination cannot be the same." },
          { status: 400 }
        );
      }

      payload = {
        type: "transfer",
        category: fromLocation === "cash" ? "Cash to Bank Deposit" : "Bank to Cash Withdrawal",
        item_name: fromLocation === "cash" ? "Cash to Bank" : "Bank to Cash",
        amount,
        money_location: null,
        from_location: fromLocation,
        to_location: toLocation,
        transaction_date: cleanText(body?.transactionDate),
        description: cleanText(body?.description) || null,
        recorded_by: staffName,
      };
    } else {
      return NextResponse.json({ error: "Unknown transaction type." }, { status: 400 });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("finance_transactions")
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);

    void logActivity({
      userName: staffName,
      role: auth.role,
      action: "FINANCE_RECORD_TRANSACTION",
      details: `Recorded ${payload.type} — "${payload.item_name}" (${payload.category || "—"}): GHS ${amount.toFixed(2)}.`,
      undoType: inserted?.id ? "DELETE_RECORD" : null,
      undoPayload: inserted?.id ? { recordType: "finance", id: inserted.id } : null,
    });

    return NextResponse.json({ message: "Transaction saved.", transaction: inserted || payload });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
