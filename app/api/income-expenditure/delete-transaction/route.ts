import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireStaffRole, unauthorizedResponse } from "@/lib/apiAuth";

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

    const { error } = await supabaseAdmin.from("finance_transactions").delete().eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Transaction deleted." });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
