import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";
import { logActivity, actorName } from "@/lib/activityLog";

const ALLOWED_ROLES = ["owner", "admin", "headmaster"] as const;

export async function POST(request: Request) {
  try {
    const auth = await requireStaffRole(request, [...ALLOWED_ROLES]);
    if (!auth.ok) return unauthorizedResponse(auth);

    const body = await request.json();
    const id = String(body?.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Transaction id is required." }, { status: 400 });
    }

    const { data: removed } = await supabaseAdmin
      .from("finance_transactions")
      .select("type, item_name, amount")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("finance_transactions").delete().eq("id", id);
    if (error) throw new Error(error.message);

    void logActivity({
      userName: actorName(auth.teacher),
      role: auth.role,
      action: "FINANCE_DELETE_TRANSACTION",
      details: `Deleted ${removed?.type || "transaction"} "${removed?.item_name || id}"${
        removed?.amount ? ` (GHS ${Number(removed.amount).toFixed(2)})` : ""
      }.`,
    });

    return NextResponse.json({ message: "Transaction deleted." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
